import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import './App.css'

class EpgError extends Error {
  constructor({ title, detail, url, fixes }) {
    super(title)
    this.name = 'EpgError'
    this.title = title
    this.detail = detail || null
    this.url = url || null
    this.fixes = fixes || []
  }
}

async function getXmlTextFromResponse(response, sourceUrl) {
  const bytes = new Uint8Array(await response.arrayBuffer())
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b

  if (!isGzip) {
    return new TextDecoder().decode(bytes)
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new EpgError({
      title: 'Your browser cannot read compressed EPG data',
      detail: 'The EPG source now returns a gzip-compressed XML file, but this browser does not support gzip decompression.',
      url: response.url || sourceUrl || '/epg',
      fixes: [
        'Update your browser to a newer version and try again.',
      ]
    })
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function getNzDateParts(timeStr) {
  if (!timeStr || timeStr.length < 14) return null

  const year = parseInt(timeStr.substring(0, 4))
  const month = parseInt(timeStr.substring(4, 6))
  const day = parseInt(timeStr.substring(6, 8))
  const hour = parseInt(timeStr.substring(8, 10))
  const minute = parseInt(timeStr.substring(10, 12))
  const second = parseInt(timeStr.substring(12, 14)) || 0

  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(utcDate)

  const lookup = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return {
    year: parseInt(lookup.year),
    month: parseInt(lookup.month),
    day: parseInt(lookup.day),
    hour: parseInt(lookup.hour),
    minute: parseInt(lookup.minute)
  }
}

function getNzDateKey(timeStr) {
  const parts = getNzDateParts(timeStr)
  if (!parts) return null
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}${month}${day}`
}

function formatTimeString(timeStr) {
  const parts = getNzDateParts(timeStr)
  if (!parts) return timeStr

  const ampm = parts.hour >= 12 ? 'pm' : 'am'
  const displayHour = parts.hour % 12 || 12
  const displayMinute = String(parts.minute).padStart(2, '0')

  return `${displayHour}:${displayMinute}${ampm}`
}

function getTimeInSeconds(timeStr) {
  if (!timeStr || timeStr.length < 14) return 0
  const hour = parseInt(timeStr.substring(8, 10))
  const minute = parseInt(timeStr.substring(10, 12))
  const second = parseInt(timeStr.substring(12, 14)) || 0
  return hour * 3600 + minute * 60 + second
}

function getDateInSeconds(timeStr) {
  if (!timeStr || timeStr.length < 8) return 0
  const year = parseInt(timeStr.substring(0, 4))
  const month = parseInt(timeStr.substring(4, 6))
  const day = parseInt(timeStr.substring(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  return Math.floor(date.getTime() / 1000)
}

function getFullTimeInSeconds(timeStr) {
  return getDateInSeconds(timeStr) + getTimeInSeconds(timeStr)
}

function getCurrentTimeInSeconds() {
  const now = new Date()
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
}

function getStartTimeInMinutes(timeStr) {
  if (!timeStr || timeStr.length < 12) return 0
  const hour = parseInt(timeStr.substring(8, 10))
  const minute = parseInt(timeStr.substring(10, 12))
  return hour * 60 + minute
}

function getLocalStartMinutes(timeStr) {
  const parts = getNzDateParts(timeStr)
  if (!parts) return 0
  return parts.hour * 60 + parts.minute
}

function getDurationInMinutes(startStr, stopStr) {
  if (!startStr || !stopStr || startStr.length < 14 || stopStr.length < 14) return 0
  
  const startYear = parseInt(startStr.substring(0, 4))
  const startMonth = parseInt(startStr.substring(4, 6))
  const startDay = parseInt(startStr.substring(6, 8))
  const startHour = parseInt(startStr.substring(8, 10))
  const startMin = parseInt(startStr.substring(10, 12))
  
  const stopYear = parseInt(stopStr.substring(0, 4))
  const stopMonth = parseInt(stopStr.substring(4, 6))
  const stopDay = parseInt(stopStr.substring(6, 8))
  const stopHour = parseInt(stopStr.substring(8, 10))
  const stopMin = parseInt(stopStr.substring(10, 12))
  
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay, startHour, startMin))
  const stopDate = new Date(Date.UTC(stopYear, stopMonth - 1, stopDay, stopHour, stopMin))
  
  const diffMs = stopDate - startDate
  return Math.round(diffMs / (1000 * 60))
}

function formatDateKey(dateKey) {
  return `${dateKey.substring(0, 4)}-${dateKey.substring(4, 6)}-${dateKey.substring(6, 8)}`
}

function App() {
  const [epgData, setEpgData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [channels, setChannels] = useState([])
  const [programmes, setProgrammes] = useState([])
  const [selectedChannelIds, setSelectedChannelIds] = useState(() => {
    // Initialize from localStorage immediately
    const savedChannelIds = localStorage.getItem('selectedChannelIds')
    if (savedChannelIds) {
      try {
        return JSON.parse(savedChannelIds)
      } catch (err) {
        console.error('Error loading saved channels:', err)
        return []
      }
    }
    return []
  })
  
  // Refs for programme columns to enable scrolling
  const programmesColumnRefs = useRef({})
  const programmesGridWrapperRef = useRef(null)
  const timeAxisRef = useRef(null)
  const [hoveredImage, setHoveredImage] = useState(null)
  const [selectedProgramme, setSelectedProgramme] = useState(null)
  const [channelsExpanded, setChannelsExpanded] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [availableDates, setAvailableDates] = useState([])
  const hideImageTimeoutRef = useRef(null)

  useEffect(() => {
    // Save selected channels to localStorage whenever they change
    localStorage.setItem('selectedChannelIds', JSON.stringify(selectedChannelIds))
  }, [selectedChannelIds])

  useEffect(() => {
    // Scroll to current time when programmes are displayed
    if (selectedChannelIds.length > 0 && programmes.length > 0 && programmesGridWrapperRef.current && selectedDate) {
      setTimeout(() => {
        const now = new Date()
        const nzParts = new Intl.DateTimeFormat('en-NZ', {
          timeZone: 'Pacific/Auckland',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).formatToParts(now)
        const nzLookup = Object.fromEntries(nzParts.map(p => [p.type, p.value]))
        const today = `${nzLookup.year}${nzLookup.month}${nzLookup.day}`
        
        // Only scroll to current time if viewing today's date
        let targetScrollTop = 0
        
        if (selectedDate === today) {
          // For today, scroll to one hour before current time
          const currentHour = parseInt(nzLookup.hour)
          const currentMinute = parseInt(nzLookup.minute)
          const currentMinutesOfDay = currentHour * 60 + currentMinute
          const targetMinutesOfDay = currentMinutesOfDay - 60 // One hour earlier
          targetScrollTop = Math.max(0, targetMinutesOfDay) - 100 // Scroll offset
        } else {
          // For other dates, scroll to the beginning
          targetScrollTop = 0
        }
        
        // Scroll the wrapper to position all channels at the same scroll point
        programmesGridWrapperRef.current.scrollTop = targetScrollTop
      }, 100)
    }
  }, [selectedChannelIds, programmes, selectedDate])

  const fetchEPG = async () => {
    try {
      setLoading(true)
      setError(null)
      const EPG_SOURCES = ['/epg', 'https://i.mjh.nz/nz/epg.xml', 'https://i.mjh.nz/nz/epg.xml.gz']
      let xmlText = null
      let epgSource = null
      let lastError = null
      const attemptedSources = []

      for (const source of EPG_SOURCES) {
        epgSource = source
        attemptedSources.push(source)
        try {
          const response = await fetch(source)

          if (!response.ok) {
            throw new EpgError({
              title: 'EPG server returned an error',
              detail: `HTTP ${response.status} ${response.statusText}`,
              url: source,
              fixes: [
                response.status === 404
                  ? 'The EPG file was not found on the server. The URL may have changed.'
                  : response.status >= 500
                  ? 'The EPG server is experiencing issues. Try again later.'
                  : `Unexpected HTTP ${response.status} response from the EPG server.`,
                'If the problem persists, check https://i.mjh.nz for service status.',
              ]
            })
          }

          xmlText = await getXmlTextFromResponse(response, source)
          break
        } catch (sourceError) {
          lastError = sourceError
          console.warn(`EPG source failed: ${source}`, sourceError)
        }
      }

      if (!xmlText) {
        if (lastError instanceof EpgError) {
          throw lastError
        }

        throw new EpgError({
          title: 'Network error — could not reach EPG server',
          detail: `All configured EPG sources failed: ${attemptedSources.join(', ')}. Last error: ${lastError?.message || 'Unknown error'}`,
          url: epgSource,
          fixes: [
            'Check your internet connection and try again.',
            'The EPG server may be temporarily unreachable — try again in a few minutes.',
          ]
        })
      }

      // Parse XML
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

      // Check for parsing errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new EpgError({
          title: 'Failed to parse EPG data',
          detail: xmlDoc.getElementsByTagName('parsererror')[0]?.textContent || 'The XML returned by the server could not be parsed.',
          url: epgSource,
          fixes: [
            'The EPG server may have returned malformed data. Try again later.',
          ]
        })
      }

      // Store raw XML data in memory
      setEpgData(xmlDoc)

      // Extract channels
      const channelElements = xmlDoc.getElementsByTagName('channel')
      const channelList = Array.from(channelElements).map(channel => ({
        id: channel.getAttribute('id'),
        name: channel.getElementsByTagName('display-name')[0]?.textContent || 'Unknown',
        icon: channel.getElementsByTagName('icon')[0]?.getAttribute('src') || null
      }))
      setChannels(channelList)

      // Extract programmes
      const programmeElements = xmlDoc.getElementsByTagName('programme')
      const programmeList = Array.from(programmeElements).map(prog => ({
        start: prog.getAttribute('start'),
        stop: prog.getAttribute('stop'),
        channel: prog.getAttribute('channel'),
        title: prog.getElementsByTagName('title')[0]?.textContent || 'Unknown',
        description: prog.getElementsByTagName('desc')[0]?.textContent || '',
        category: prog.getElementsByTagName('category')[0]?.textContent || '',
        icon: prog.getElementsByTagName('icon')[0]?.getAttribute('src') || null
      }))
      setProgrammes(programmeList)

      // Log to check if icons are being extracted
      console.log('Sample programmes with icons:', programmeList.filter(p => p.icon).slice(0, 5))
    } catch (err) {
      setError(err)
      console.error('Error fetching EPG:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEPG()
  }, [])

  useEffect(() => {
    if (programmes.length === 0) {
      setAvailableDates([])
      return
    }

    const datesSet = new Set()
    programmes.forEach(prog => {
      const dateStr = getNzDateKey(prog.start)
      if (dateStr) {
        datesSet.add(dateStr)
      }
    })

    const datesList = Array.from(datesSet).sort()
    setAvailableDates(datesList)

    if (datesList.length === 0) {
      setSelectedDate(null)
      return
    }

    // Default to today's NZ date if available, otherwise first date
    const now = new Date()
    const nzParts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now)
    const lookup = Object.fromEntries(nzParts.map(p => [p.type, p.value]))
    const nzDateStr = `${lookup.year}${lookup.month}${lookup.day}`

    setSelectedDate(prev => {
      if (prev && datesList.includes(prev)) return prev
      return datesList.includes(nzDateStr) ? nzDateStr : datesList[0]
    })
  }, [programmes])

  if (loading) {
    return <div className="container"><h1>Loading EPG data...</h1></div>
  }

  if (error) {
    const errObj = error instanceof EpgError
      ? error
      : { title: error.message || String(error), detail: null, url: null, fixes: [] }
    return (
      <div className="container error">
        <h1>⚠ EPG Load Failed</h1>
        <p className="error-title">{errObj.title}</p>
        {errObj.detail && <p className="error-detail"><strong>Detail:</strong> {errObj.detail}</p>}
        {errObj.url && <p className="error-detail"><strong>Source:</strong> <code>{errObj.url}</code></p>}
        {errObj.fixes && errObj.fixes.length > 0 && (
          <div className="error-fixes">
            <strong>Possible fixes:</strong>
            <ul>
              {errObj.fixes.map((fix, i) => <li key={i}>{fix}</li>)}
            </ul>
          </div>
        )}
        <button className="retry-button" onClick={fetchEPG}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="programmes-section">
        <div className="top-bar">
          <button 
            className="accordion-header"
            onClick={() => setChannelsExpanded(!channelsExpanded)}
          >
            <span>Channels ({channels.length})</span>
            <span className={`accordion-icon ${channelsExpanded ? 'open' : ''}`}>▼</span>
          </button>
          {availableDates.length > 0 && (
            <div className="date-selector">
              <label htmlFor="date-picker">Date:</label>
              <input
                type="date"
                id="date-picker"
                value={selectedDate ? formatDateKey(selectedDate) : ''}
                min={formatDateKey(availableDates[0])}
                max={formatDateKey(availableDates[availableDates.length - 1])}
                onChange={(e) => {
                  const val = e.target.value
                  if (val) {
                    setSelectedDate(val.replace(/-/g, ''))
                  }
                }}
              />
            </div>
          )}
        </div>
        {channelsExpanded && (
          <div className="channels-grid">
            {channels.map(channel => (
              <div 
                key={channel.id} 
                className={`channel-card ${selectedChannelIds.includes(channel.id) ? 'active' : ''}`}
                onClick={() => {
                  if (selectedChannelIds.includes(channel.id)) {
                    setSelectedChannelIds(selectedChannelIds.filter(id => id !== channel.id))
                  } else if (selectedChannelIds.length < 7) {
                    setSelectedChannelIds([...selectedChannelIds, channel.id])
                  }
                }}
              >
                {channel.icon && <img src={channel.icon} alt={channel.name} className="channel-icon" />}
                <p>{channel.name}</p>
              </div>
            ))}
          </div>
        )}
        {selectedChannelIds.length > 0 ? (
          <>
            <div className="channels-header-row">
              <div className="time-axis-placeholder"></div>
              <div className="channels-header-grid">
                {selectedChannelIds.map(channelId => (
                  <div key={channelId} className="channel-header">
                    {channels.find(c => c.id === channelId)?.name}
                  </div>
                ))}
              </div>
            </div>
            <div className="programmes-container">
              <div className="time-axis" ref={timeAxisRef}>
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="time-slot" style={{ height: '60px' }}>
                    <span className="time-label">
                      {String(i).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>
              <div 
                className="programmes-grid-wrapper"
                ref={programmesGridWrapperRef}
                onScroll={(e) => {
                  // Sync scroll position across all channel columns
                  const scrollTop = e.target.scrollTop
                  Object.values(programmesColumnRefs.current).forEach(col => {
                    if (col) col.scrollTop = scrollTop
                  })
                  if (timeAxisRef.current) timeAxisRef.current.scrollTop = scrollTop
                }}
              >
              <div className="programmes-grid">
                {selectedChannelIds.map(channelId => (
                  <div key={channelId} className="channel-column">
                    <div 
                      className="programmes-column"
                      ref={el => {
                        if (el) programmesColumnRefs.current[channelId] = el
                      }}
                    >
                      {programmes
                        .filter(prog => prog.channel === channelId && getNzDateKey(prog.start) === selectedDate)
                        .map((prog, idx) => {
                          const localMinutes = getLocalStartMinutes(prog.start)
                          const topPixels = localMinutes // 1 pixel per minute
                          const heightPixels = getDurationInMinutes(prog.start, prog.stop)
                          
                          return (
                            <div 
                              key={idx} 
                              className="programme-card"
                              style={{
                                position: 'absolute',
                                top: `${topPixels}px`,
                                height: `${heightPixels}px`,
                                width: '100%'
                              }}
                            >
                              <h3 
                                className={prog.icon ? 'programme-title-with-icon' : ''}
                                onClick={() => {
                                  if (prog.icon) {
                                    console.log('Clicked title, showing image:', prog.icon)
                                    setSelectedProgramme(prog)
                                  }
                                }}
                                style={prog.icon ? { cursor: 'pointer' } : {}}
                              >
                                {prog.title}
                              </h3>
                              <p className="time">
                                {formatTimeString(prog.start)}
                              </p>
                              <p className="duration">
                                {getDurationInMinutes(prog.start, prog.stop)} min
                              </p>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </>
        ) : (
          <p className="select-prompt">Select up to 7 channels to view their programmes</p>
        )}
      </div>
      
      {selectedProgramme && ReactDOM.createPortal(
        <>
          {console.log('Rendering image popup with image:', selectedProgramme.icon)}
          <div 
            className="image-popup-overlay"
            onClick={() => setSelectedProgramme(null)}
          >
            <div className="image-popup" onClick={(e) => e.stopPropagation()}>
              <img 
                src={selectedProgramme.icon} 
                alt="Programme artwork"
                onError={() => {
                  console.error('Image failed to load:', selectedProgramme.icon)
                  setSelectedProgramme(null)
                }}
                onLoad={() => console.log('Image loaded successfully')}
              />
              {selectedProgramme.description && (
                <div className="popup-description">
                  {selectedProgramme.description}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export default App

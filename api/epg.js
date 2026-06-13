export default async function handler(req, res) {
  try {
    const response = await fetch('https://i.mjh.nz/nz/epg.xml.gz', {
      redirect: 'follow',
      headers: {
        'User-Agent': 'vibeTV/1.0',
      },
    })

    if (!response.ok) {
      res.status(502).send('Failed to fetch EPG data')
      return
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = await response.arrayBuffer()

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    res.status(502).send('Failed to fetch EPG data')
  }
}

# React + Vite

This is a new React application built with Vite, a modern frontend build tool.

## Getting Started

### Prerequisites
- Node.js 20.15.1 or higher
- npm

### Installation

Install dependencies:

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Build for production:

```bash
npm run build
```

### Preview

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

- `src/` - Source code
  - `App.jsx` - Main React component
  - `main.jsx` - Application entry point
  - `App.css` - App styles
  - `index.css` - Global styles
- `index.html` - HTML template
- `vite.config.js` - Vite configuration
- `package.json` - Project dependencies and scripts

## Features

- ⚡ Lightning fast development server with Vite
- ⚛️ React 18
- 🔥 Hot Module Replacement (HMR)
- 📦 Optimized production builds
- 📺 Fetches live NZ TV EPG data from https://i.mjh.nz/nz/epg.xml
- ⚠️ Displays a detailed error message (HTTP status, cause, and suggested fixes) if the EPG cannot be loaded — no stale cached data is shown

## Development Notes

The app always fetches live EPG data from the remote URL on startup. If the request fails (network error, non-2xx HTTP response, or parse failure), a detailed error screen is shown with the HTTP status code, error message, and suggested fixes — along with a **Retry** button. No stale local fallback is used, so the data displayed is always current.

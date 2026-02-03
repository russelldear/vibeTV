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
- 📺 Fetches NZ TV EPG data from https://i.mjh.nz/nz/epg.xml with local fallback
- 📂 Includes local copy of EPG data (`public/epg.xml`) for development and offline work

## Development Notes

The app fetches the EPG (Electronic Program Guide) data on startup. It will attempt to fetch the latest data from the remote URL first, but will fall back to the local cached copy (`public/epg.xml`) if the remote request fails. This allows for uninterrupted development work even without internet connectivity.

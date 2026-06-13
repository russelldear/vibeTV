import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/epg': {
        target: 'https://i.mjh.nz',
        changeOrigin: true,
        rewrite: (_path) => '/nz/epg.xml',
        followRedirects: true,
      },
    },
  },
})

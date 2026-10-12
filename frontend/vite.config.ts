import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward /api calls to the backend during local development.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})

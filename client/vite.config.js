import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react()
  ],
  server: {
    proxy: {
      '/api': { // Proxy requests from /api
        target: 'http://localhost:5000', // Your Flask backend
        changeOrigin: true, // Recommended for virtual hosted sites
        // rewrite: (path) => path.replace(/^\/api/, '') // if your Flask doesn't expect /api prefix
      },
      '/socket.io': { // Proxy Socket.IO requests
        target: 'ws://localhost:5000', // Your Flask Socket.IO backend
        ws: true, // IMPORTANT: enable WebSocket proxying
        changeOrigin: true,
      }
    }
  }
})

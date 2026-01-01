import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate'
    })
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      'all'
    ]
  },
  preview: {
    allowedHosts: [
      'all'
    ]
  }
})

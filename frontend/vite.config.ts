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
      'aifocus-production.up.railway.app'
    ]
  },
  preview: {
    allowedHosts: [
      'aifocus-production.up.railway.app'
    ]
  }
})

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The dashboard talks to the backend through this proxy, so there are no CORS problems in development.
// Backend on another port?  PowerShell:  $env:VITE_API_TARGET="http://localhost:4100"; npm run dev
const target = process.env.VITE_API_TARGET ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': { target, changeOrigin: true } } },
})
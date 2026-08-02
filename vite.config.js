import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

const API = process.env.VITE_API_URL || 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    // Godot project lives beside the web client; its editor temp files crash Vite's watcher (EBUSY).
    watch: {
      ignored: ['**/loot&lasers/**', '**/.godot/**'],
    },
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
      },
      '/ws': {
        target: API,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})

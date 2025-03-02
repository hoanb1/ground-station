import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // You can set '0.0.0.0' or a specific hostname to allow external access
    port: 5173, // Replace with a port number of your choice
  }
})

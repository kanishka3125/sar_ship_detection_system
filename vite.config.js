import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'three/webgpu': resolve(__dirname, 'src/stubs/three-webgpu-stub.js'),
      'three/tsl':    resolve(__dirname, 'src/stubs/three-tsl-stub.js'),
    },
  },
  optimizeDeps: {
    exclude: ['three-globe', 'react-globe.gl'],
    include: ['three', '@react-three/fiber', '@react-three/drei', 'leaflet', 'react-leaflet'],
  },
})

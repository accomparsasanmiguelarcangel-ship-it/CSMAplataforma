import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages uses its repository subpath; Android bundles assets locally.
  base: mode === 'android' ? './' : '/CSMAplataforma/',
  server: { port: 5173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
}))

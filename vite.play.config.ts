import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone Battle build (see src/play.tsx): one page, relative paths, output in dist-play/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-play', rollupOptions: { input: 'play.html' } },
})

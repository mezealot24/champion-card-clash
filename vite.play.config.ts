import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone Battle build (see src/play.tsx): one page, relative paths, output in dist-play/.
// Assets (the pose sheets) are inlined so scripts/pack-play.mjs can pack it all into one HTML file.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-play', assetsInlineLimit: () => true, rollupOptions: { input: 'play.html' } },
})

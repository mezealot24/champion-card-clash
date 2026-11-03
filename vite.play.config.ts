import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Version + commit for the title-screen build label (Closed Beta). Vercel sets VERCEL_GIT_COMMIT_SHA at build time.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)

// Standalone Battle build (see src/play.tsx): one page, relative paths, output in dist-play/.
// Assets (the pose sheets) are inlined so scripts/pack-play.mjs can pack it all into one HTML file.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: JSON.stringify(commit) },
  base: './',
  build: { outDir: 'dist-play', assetsInlineLimit: () => true, rollupOptions: { input: 'play.html' } },
})

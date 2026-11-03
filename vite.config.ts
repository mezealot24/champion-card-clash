import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Version + commit for the title-screen build label (Closed Beta). Vercel sets VERCEL_GIT_COMMIT_SHA at build time.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: JSON.stringify(commit) },
})

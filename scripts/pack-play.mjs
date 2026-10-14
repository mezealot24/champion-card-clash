// Packs dist-play/ into one self-contained HTML file with a data snapshot inlined.
// Usage: npm run build:play && node scripts/pack-play.mjs <play-data.json> [out.html]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dataPath, out = 'dist-play/champion-card-clash.html'] = process.argv.slice(2)
if (!dataPath) throw new Error('usage: node scripts/pack-play.mjs <play-data.json> [out.html]')

const dir = 'dist-play'
const data = JSON.stringify(JSON.parse(readFileSync(dataPath, 'utf8'))).replace(/</g, '\\u003c')
let html = readFileSync(join(dir, 'play.html'), 'utf8')
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync(join(dir, f), 'utf8')}</style>`)
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, f) =>
  `<script>window.__PLAY_DATA__=${data}</script><script type="module">${readFileSync(join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`,
)
writeFileSync(out, html)
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`)

// Standalone Battle page with a data snapshot (no Supabase, no login), for sharing a playable link.
// `npm run build:play` builds it; `node scripts/pack-play.mjs play-data.json` packs it into one HTML file
// with the snapshot ({ champions, cards } like BattlePage loads) inlined as window.__PLAY_DATA__.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Battle, type BattleData } from './pages/Battle'

declare global {
  interface Window {
    __PLAY_DATA__?: BattleData
  }
}

async function main() {
  const data = window.__PLAY_DATA__ ?? ((await (await fetch('./play-data.json')).json()) as BattleData)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <main>
        <Battle data={data} />
      </main>
    </StrictMode>,
  )
}
main()

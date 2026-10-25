// Placeholder Champion drawings (chibi, side view, facing right) for the battle screen.
// Parts carry classes the arena animates: .bob (whole body), .arm-f (front arm + weapon), .leg-f (front leg).
// Real art can replace these later as long as it keeps the same part classes.
// A Champion or Style with a pose sheet (SPRITES) draws that instead; the arena picks the pose (see POSES).
import asSheet from './sprites/as.webp'
import brSheet from './sprites/br.webp'
import tkSheet from './sprites/tk.webp'
import pyroSheet from './sprites/mg-1.webp'
import cryoSheet from './sprites/mg-2.webp'

export const CHAMP_COLOR: Record<string, string> = { TK: '#1fc6a6', AS: '#a96bff', BR: '#ff6a3d', MG: '#4f9dff' }
export const champColor = (id: string) => CHAMP_COLOR[id] ?? '#b8acd8'

const INK = '#0c0718'
const SKIN = '#ffd9b8'
const st = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`
const eyes = (y: number) => `<ellipse cx="37" cy="${y}" rx="1.8" ry="2.6" fill="${INK}"/><ellipse cx="43" cy="${y}" rx="1.8" ry="2.6" fill="${INK}"/>`

function parts(id: string, col: string) {
  switch (id) {
    case 'AS':
      return {
        head: `<circle cx="32" cy="21" r="14" fill="${SKIN}" ${st}/><path d="M17 22 A15 15 0 0 1 47 19 L47 15 Q33 2 19 12 Z" fill="${col}" ${st}/><path d="M18 22 Q16 34 24 34" fill="none" ${st}/><rect x="30" y="24" width="18" height="6" rx="3" fill="${INK}"/>${eyes(19.5)}`,
        body: `<rect x="21" y="34" width="20" height="20" rx="7" fill="${col}" ${st}/><path d="M22 46 h18" stroke="${INK}" stroke-width="2"/>`,
        weapon: `<path d="M34.5 53 L37 70 L39.5 53 Z" fill="#e8eefc" ${st}/><rect x="33" y="51" width="8" height="3" rx="1" fill="#ffc84a" stroke="${INK}" stroke-width="1.5"/>`,
      }
    case 'TK':
      return {
        head: `<circle cx="32" cy="22" r="15" fill="${SKIN}" ${st}/><path d="M18 14 Q32 -2 46 14 L46 19 L18 19 Z" fill="#8f97c4" ${st}/><path d="M30 4 Q34 -4 40 2" fill="none" stroke="#ff5470" stroke-width="4" stroke-linecap="round"/>${eyes(24)}<path d="M36 30 q4 2 8 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
        body: `<rect x="17" y="33" width="27" height="23" rx="8" fill="${col}" ${st}/><rect x="17" y="33" width="27" height="7" rx="3.5" fill="#8f97c4" ${st}/>`,
        weapon: `<rect x="29" y="42" width="18" height="24" rx="6" fill="${col}" ${st}/><circle cx="38" cy="54" r="4" fill="#ffc84a" stroke="${INK}" stroke-width="2"/>`,
      }
    case 'BR':
      return {
        head: `<circle cx="32" cy="21" r="14" fill="${SKIN}" ${st}/><path d="M19 13 Q32 2 45 13 L45 9 Q32 -2 19 9 Z" fill="#5a3418" ${st}/><rect x="17" y="13" width="30" height="5" rx="2" fill="#ff5470" ${st}/><path d="M17 15 l-7 -3 m7 5 l-6 3" stroke="#ff5470" stroke-width="3" stroke-linecap="round"/>${eyes(22)}<path d="M35 29 h9" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
        body: `<rect x="16" y="33" width="28" height="22" rx="9" fill="${col}" ${st}/><path d="M30 34 v20" stroke="${INK}" stroke-width="2"/>`,
        weapon: `<circle cx="37.5" cy="56" r="6" fill="${SKIN}" ${st}/><path d="M33 53 h9" stroke="${INK}" stroke-width="1.5"/>`,
      }
    case 'MG':
      return {
        head: `<circle cx="32" cy="23" r="14" fill="${SKIN}" ${st}/><path d="M14 18 Q32 10 50 18 L46 20 L18 20 Z" fill="${col}" ${st}/><path d="M20 18 L30 -6 Q34 -2 36 4 L44 18 Z" fill="${col}" ${st}/><circle cx="31" cy="-5" r="3" fill="#ffc84a" ${st}/>${eyes(25)}`,
        body: `<path d="M22 34 h18 l5 22 h-28 Z" fill="${col}" ${st}/><path d="M31 34 v22" stroke="#ffc84a" stroke-width="2"/>`,
        weapon: `<rect x="36" y="40" width="3.5" height="34" rx="1.5" fill="#8a5a2b" ${st}/><circle cx="37.75" cy="38" r="5" fill="#ffc84a" ${st}/>`,
      }
    default:
      return {
        head: `<circle cx="32" cy="21" r="14" fill="${SKIN}" ${st}/>${eyes(21)}`,
        body: `<rect x="20" y="34" width="22" height="21" rx="7" fill="${col}" ${st}/>`,
        weapon: '',
      }
  }
}

// Pose sheets: 24 frames side by side in POSES order, each 320x270, drawing centred at x 160 with the feet at y 262
// (scripts/cut-pose-sheets.py builds them from Q's atlases). Art is placeholder until Beta, so swapping a file here is all a new look needs.
export const POSES = [
  'idle', 'P', 'K', 'S', 'block', 'charge', 'hit', 'win',
  'signature', 'crit', 'power', 'mechanic', 'exhaust', 'low', 'stunned', 'ko',
  'P2', 'P3', 'Pfin', 'K2', 'K3', 'S2', 'dash', 'backstep',
] as const
export type Pose = (typeof POSES)[number]
// key: a Style ("MG:1") first, else the Champion ("AS")
const SPRITES: Record<string, string> = { AS: asSheet, BR: brSheet, TK: tkSheet, 'MG:1': pyroSheet, 'MG:2': cryoSheet }
const spriteKey = (champId: string, style?: string | null) => (style && SPRITES[style] ? style : SPRITES[champId] ? champId : null)
const spriteClass = (key: string) => `sprite-${key.replace(':', '-')}`

// One <style> holds every sheet's URL; a browser only fetches the ones a drawn fighter uses
let spriteCss = false
function ensureSpriteCss() {
  if (spriteCss || typeof document === 'undefined') return
  spriteCss = true
  const el = document.createElement('style')
  el.textContent = Object.entries(SPRITES).map(([key, url]) => `.${spriteClass(key)}{--sheet:url(${url})}`).join('')
  document.head.appendChild(el)
}

/** Class of the pose sheet for a Champion / Style (its CSS injected), or null when it only has the SVG doll. */
export function spriteClassOf(champId: string, style?: string | null): string | null {
  const key = spriteKey(champId, style)
  if (!key) return null
  ensureSpriteCss()
  return spriteClass(key)
}

/** Inner HTML of a fighter: aura, the drawing, the guard bubble. */
export function fighterHTML(champId: string, style?: string | null): string {
  const key = spriteKey(champId, style)
  if (key) {
    ensureSpriteCss()
    return `<i class="aura"></i><div class="sprite ${spriteClass(key)}" aria-hidden="true"></div><i class="guard"></i>`
  }
  const col = champColor(champId)
  const { head, body, weapon } = parts(champId, col)
  return `<i class="aura"></i><svg viewBox="0 0 64 84" aria-hidden="true"><ellipse cx="31" cy="80" rx="18" ry="3.5" fill="rgba(0,0,0,.35)"/>
    <g class="bob">
      <g class="part leg-b"><rect x="23" y="52" width="7" height="25" rx="3" fill="#3a2d63" ${st}/></g>
      <g class="part leg-f"><rect x="31" y="52" width="7" height="25" rx="3" fill="#3a2d63" ${st}/></g>
      <g class="part arm-b"><rect x="19" y="36" width="7" height="18" rx="3.5" fill="${col}" ${st}/></g>
      ${body}
      <g class="head">${head}</g>
      <g class="part arm-f"><rect x="34" y="36" width="7" height="18" rx="3.5" fill="${col}" ${st}/>${weapon}</g>
    </g></svg><i class="guard"></i>`
}

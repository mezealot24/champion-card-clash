// Arcade final boss (Q 2026-10-29: "a mash-up of every Champion, like Seth in Street Fighter 4").
// One HP bar cut into equal parts, one per form. Each form is a Champion with its Style and deck: it plays exactly
// like that Champion (resource, combos, Style). When the HP drops past the next line at the end of a turn, the boss
// shifts: its Field and deck leave, the next form's deck comes in and it draws shiftDraw cards at once.
// At most one shift a turn, so a big hit never skips a form. Heals can't take a form back.
import { drawCards, emit, inStyleDeck, log, markDiscarded, shuffle, toDeckBottom, type ChampionSetup } from './state'
import { hooksOf } from './styles'
import { resourceOf } from './resources'
import { tuningOf } from './tuning'
import type { BossForm, GameState, Side } from './types'

/** The boss as a createGame seat: it starts in its first form. */
export function bossSetup(name: string, forms: BossForm[], hp: number, shiftDraw: number): ChampionSetup {
  const f = forms[0]
  return { championId: f.championId, hpStart: hp, hpMax: hp, deck: f.deck, style: f.style, boss: { name, forms, hpBase: hp, shiftDraw } }
}

/** HP the boss must drop to (or below) to leave form `at`. */
export const shiftLine = (hpBase: number, forms: number, at: number) => Math.floor((hpBase * (forms - at - 1)) / forms)

/** End of turn: a boss whose HP dropped past its form's line turns into the next form. Returns true when it shifted. */
export function bossShift(state: GameState, side: Side): boolean {
  const p = state.players[side]
  const b = p.boss
  if (!b || p.hp <= 0 || b.at >= b.forms.length - 1 || p.hp > shiftLine(b.hpBase, b.forms.length, b.at)) return false
  b.at++
  const f = b.forms[b.at]
  // the old form's cards leave the game; cards it stole go back to their owner
  markDiscarded(state, side, p.hand.map((card, i) => ({ card, slot: i + 1, reason: 'Form shift' })))
  toDeckBottom(state, side, [...p.hand, ...p.deck].filter((c) => c.owner && c.owner !== side))
  p.hand = []
  p.deck = shuffle(state, f.deck.filter((def) => inStyleDeck(def, f.style)).map((def, i) => ({ uid: `${side}-f${b.at}-${def.id}-${i}`, def })))
  p.drawsSinceShuffle = 0
  p.championId = f.championId
  p.style = f.style
  // the old form's Style / combo / class bookkeeping goes with it (a Sudden death heal cut stays)
  p.styleData = undefined
  p.comboData = undefined
  p.fieldMax = undefined
  p.perkData = p.perkData?.healPct != null ? { healPct: p.perkData.healPct } : undefined
  p.res = resourceOf(f.championId, tuningOf(state, side))?.start ?? 0
  for (const h of hooksOf(p)) h.setup?.(p, tuningOf(state, side))
  emit(state, { k: 'shift', side, championId: f.championId, style: f.style, form: b.at })
  log(state, `${side} ${b.name} shifts into form ${b.at + 1}/${b.forms.length}: ${f.championId}${f.style ? ` (${f.style})` : ''}`)
  drawCards(state, side, b.shiftDraw)
  return true
}

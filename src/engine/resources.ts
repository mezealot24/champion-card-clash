// Class resources (Q 2026-10-15, thread "S card resource"): every S card has a cost.
// Paid when the card fires in a Strike chain, in chain order. Can't pay → the card still hits, its effects are off
// except its drawbacks (lose HP etc., Q 2026-10-15).
// Spec: /mnt/project-files/plans/s-card-resource-system.md. Numbers are starting values for playtest.
import type { Action, CardInst, GameState, Side } from './types'

/** What a resource can react to at the end of a turn. */
export type TurnSummary = {
  action: Action
  enemyAction: Action
  /** Hits you took that Block didn't stop. */
  hitsTaken: number
  /** Your hits that dealt dmg past Block / Parry / Shield. */
  cleanHits: number
}

export type ResourceDef = {
  name: string
  cap: number
  start: number
  /** Cost of an S card whose cards.cost is empty. */
  defaultCost: number
  /** Tank: costs are paid in HP (never down to 0) instead of a bar. */
  payWithHp?: boolean
  /** Unpaid S cards can't be used at all: they stay on the Field and skip the chain. Unused now (Bruiser switched to unpaidDmgPct, Q 2026-10-16). */
  unpaidStays?: boolean
  /** An unpaid S card still strikes but its base dmg is cut to this % (Bruiser 50, Q 2026-10-16). Effects off, drawbacks still fire. */
  unpaidDmgPct?: number
  /** Change to the bar at the end of the turn. */
  gain?: (t: TurnSummary) => number
}

export const RESOURCES: Record<string, ResourceDef> = {
  // Mana: +1 when you Charge, +1 when you Block. Keeps between turns.
  MG: { name: 'Mana', cap: 5, start: 0, defaultCost: 2, gain: (t) => (t.action === 'strike' ? 0 : 1) },
  // Rage: +1 per hit you take, +1 per clean hit you land; −1 on a quiet turn (nobody Strikes you and you don't Strike).
  BR: {
    name: 'Rage',
    cap: 20, // Q 17:59Z: nerf, cap 5 → 20
    start: 0,
    defaultCost: 20, // default 20; cards.cost can set 10 or 20 per card (Q 2026-10-16)
    unpaidDmgPct: 50, // Rage short of the cost: S still strikes at half base dmg, effects off, drawbacks fire
    gain: (t) => (t.action !== 'strike' && t.enemyAction !== 'strike' ? -1 : t.hitsTaken + t.cleanHits),
  },
  // Energy: starts full, +1 every turn, small cap.
  AS: { name: 'Energy', cap: 3, start: 3, defaultCost: 1, gain: () => 1 },
  // Tank: no bar, S cards cost HP.
  TK: { name: 'HP', cap: 0, start: 0, defaultCost: 10, payWithHp: true },
}

// own log helper: state.ts imports this file, so importing state.ts back would be circular
const log = (state: GameState, line: string) => state.log.push(`T${state.turn} ${line}`)

export const resourceOf = (championId: string): ResourceDef | undefined => RESOURCES[championId]

/** What this card costs its current holder. P/K cost nothing unless cards.cost says so. */
export function costOf(championId: string, card: CardInst): number {
  const def = resourceOf(championId)
  if (!def) return 0
  if (card.def.cost != null) return Math.max(0, card.def.cost)
  return card.def.type === 'S' ? def.defaultCost : 0
}

/** Add n to a side's bar, kept between 0 and its cap. No-op for Tank. */
export function addRes(state: GameState, side: Side, n: number) {
  const p = state.players[side]
  const def = resourceOf(p.championId)
  if (!def || def.payWithHp) return
  p.res = Math.max(0, Math.min(def.cap, (p.res ?? 0) + n))
}

/** Pay for every card in the chain, in order. Cards that can't be paid go into p.unpaid (only drawbacks fire this turn). */
export function payChain(state: GameState, side: Side, chain: CardInst[]) {
  const p = state.players[side]
  const def = resourceOf(p.championId)
  p.unpaid = []
  if (!def || p.silenced || !state.rules.resources) return // Silenced: effects are off anyway, nothing to pay for
  for (const card of chain) {
    const cost = costOf(p.championId, card)
    if (cost <= 0) continue
    if (def.payWithHp ? p.hp > cost : (p.res ?? 0) >= cost) {
      if (def.payWithHp) p.hp -= cost
      else p.res = (p.res ?? 0) - cost
      log(state, `${side} จ่าย ${cost} ${def.name} ให้ ${card.def.id}`)
    } else {
      p.unpaid.push(card.uid)
      log(state, `${side} ${def.name} ไม่พอสำหรับ ${card.def.id} (ต้องการ ${cost}): ${def.unpaidStays ? 'ใช้ไม่ได้ ค้างบน Field' : def.unpaidDmgPct != null ? `ตีได้ dmg ฐาน ${def.unpaidDmgPct}% เหลือแค่ผลเสีย` : 'ตีได้ แต่เหลือแค่ผลเสีย'}`)
    }
  }
}

/**
 * Bruiser-style classes: cards that couldn't be paid leave the chain and go back onto the Field, in order.
 * Returns the chain that actually strikes.
 */
export function holdUnpaid(state: GameState, side: Side, chain: CardInst[]): CardInst[] {
  const p = state.players[side]
  if (!p.unpaid?.length || !resourceOf(p.championId)?.unpaidStays) return chain
  p.hand = chain.filter((c) => p.unpaid!.includes(c.uid))
  p.unpaid = []
  return chain.filter((c) => !p.hand.includes(c))
}

/** End of turn: each class fills (or drains) its bar. */
export function gainRes(state: GameState, side: Side, t: TurnSummary) {
  if (!state.rules.resources) return
  const def = resourceOf(state.players[side].championId)
  const n = def?.gain?.(t) ?? 0
  if (n) addRes(state, side, n)
}

/** Base dmg of a card this turn: halved (or whatever the class says) when it went unpaid. */
export function baseDmgOf(state: GameState, side: Side, card: CardInst): number {
  const p = state.players[side]
  const pct = resourceOf(p.championId)?.unpaidDmgPct
  return pct != null && p.unpaid?.includes(card.uid) ? Math.floor((card.def.dmg * pct) / 100) : card.def.dmg
}

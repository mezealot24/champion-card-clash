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
  /** Times you lost HP outside a hit, caused by the opponent (their effects, Mark of Assassin). */
  foeDmg: number
  /** Times you lost HP to your own cards' drawbacks. */
  selfDmg: number
  /** Your HP as % of Max HP at the end of the turn. */
  hpPct: number
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

/**
 * Assassin Energy Surge (Q 2026-10-17): with a full Energy bar at the start of the turn, the action you pick spends it all.
 * Block → Wraith Step: hits that get past your Block deal at most 1 dmg each.
 * Charge → Shroud: no Charge break this turn, and hits on you deal half (rounded down).
 * Strike → Elusive: the enemy's Block stops 1 hit fewer.
 * Works while Silenced (it's the class, not a card). SURGE_MODES picks which are on (sim switch while Q decides).
 */
export const SURGE_CHAMPION = 'AS'
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
export const SURGE_MODES: string = env.SURGE_MODES ?? 'ABC'
const ENERGY_CAP = Number(env.AS_ENERGY_CAP ?? 3)

/** HP below this % of Max HP = the red HP bar (same line as Coup de grâce). */
export const RED_HP_PCT = 30

export const RESOURCES: Record<string, ResourceDef> = {
  // Mana: +1 when you Charge, +1 when you Block. Keeps between turns.
  MG: { name: 'Mana', cap: 5, start: 0, defaultCost: 2, gain: (t) => (t.action === 'strike' ? 0 : 1) },
  // Rage (Q 2026-10-16): +2 per hit you take and +2 each other time the opponent makes you lose HP (their effects,
  // Mark of Assassin); +1 each time your own drawbacks cost HP; +1 per clean hit you land.
  // −1 on a quiet turn (nobody Strikes, you lost no HP), but not while your HP is red (below RED_HP_PCT).
  BR: {
    name: 'Rage',
    cap: 20, // Q 17:59Z: nerf, cap 5 → 20
    start: 0,
    defaultCost: 10, // Q 2026-10-16 21:50Z: every Bruiser S costs 10 (was 20); cards.cost can still set it per card
    unpaidDmgPct: 50, // Rage short of the cost: S still strikes at half base dmg, effects off, drawbacks fire
    gain: (t) => {
      const fromFoe = 2 * (t.hitsTaken + t.foeDmg)
      const n = fromFoe + t.selfDmg + t.cleanHits
      const quiet = t.action !== 'strike' && t.enemyAction !== 'strike'
      if (quiet && !n) return t.hpPct < RED_HP_PCT ? 0 : -1
      return n
    },
  },
  // Energy: starts full, +1 every turn, small cap.
  AS: { name: 'Energy', cap: ENERGY_CAP, start: 3, defaultCost: 1, gain: () => 1 },
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
      if (def.payWithHp) {
        p.hp -= cost
        ;(state.events ??= []).push({ k: 'hp', side, delta: -cost })
      }
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

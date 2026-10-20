// Class resources (Q 2026-10-15, thread "S card resource"): every S card has a cost.
// Paid when the card fires in a Strike chain, in chain order. Can't pay → the card still hits, its effects are off
// except its drawbacks (lose HP etc., Q 2026-10-15).
// Spec: /mnt/project-files/plans/s-card-resource-system.md. Numbers are starting values for playtest.
import type { Action, CardInst, GameState, Side } from './types'
import { DEFAULT_TUNING, tuningOf, type Tuning } from './tuning'

/** What a resource can react to at the end of a turn. */
export type TurnSummary = {
  action: Action
  enemyAction: Action
  /** Hits you took that Block didn't stop. */
  hitsTaken: number
  /** Your hits that dealt dmg past Block / Parry / Shield. */
  cleanHits: number
  /** Your Punch / Kick cards among those clean hits (Mage Mana). */
  cleanPK: number
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
 * Strike → no Surge, the bar stays for Overdrive and S cards.
 * Works while Silenced (it's the class, not a card).
 */
export const SURGE_CHAMPION = 'AS'
/** Which Surge actions are on: A = Block (Wraith Step), B = Charge (Shroud). Q 2026-10-17 picked A+B; C (Strike) is off. */
export const SURGE_MODES = 'AB'

/** HP below this % of Max HP = the red HP bar (battle HUD). Styles and Rage have their own tunable lines (tuning.ts). */
export const RED_HP_PCT = 30

/** Class resources with this game's numbers (engine/tuning.ts; Admin can change them). */
export function resourcesFor(t: Tuning): Record<string, ResourceDef> {
  return {
    // Mana: +1 when you Charge, +1 when you Block, +1 per Punch / Kick card that hits clean (Q 2026-10-17). Keeps between turns.
    MG: {
      name: 'Mana',
      cap: t.MG.cap,
      start: t.MG.start,
      defaultCost: t.MG.sCost,
      gain: (r) => (r.action === 'strike' ? 0 : t.MG.perChargeBlock) + r.cleanPK * t.MG.perCleanPK,
    },
    // Rage (Q 2026-10-16): +2 per hit you take and +2 each other time the opponent makes you lose HP (their effects,
    // Mark of Assassin); +1 each time your own drawbacks cost HP; +1 per clean hit you land.
    // −1 on a quiet turn (nobody Strikes, you lost no HP), but not while your HP is red (below quietSafeHpPct).
    BR: {
      name: 'Rage',
      cap: t.BR.cap, // Q 17:59Z: nerf, cap 5 → 20
      start: t.BR.start,
      defaultCost: t.BR.sCost, // Q 2026-10-16 21:50Z: every Bruiser S costs 10 (was 20); cards.cost can still set it per card
      unpaidDmgPct: t.BR.unpaidDmgPct, // Rage short of the cost: S still strikes at half base dmg, effects off, drawbacks fire
      gain: (r) => {
        const quiet = r.action !== 'strike' && r.enemyAction !== 'strike'
        if (quiet && !(r.hitsTaken + r.foeDmg + r.selfDmg + r.cleanHits)) return r.hpPct < t.BR.quietSafeHpPct ? 0 : -t.BR.quietLoss
        return t.BR.perHitTaken * (r.hitsTaken + r.foeDmg) + t.BR.perSelfDmg * r.selfDmg + t.BR.perCleanHit * r.cleanHits
      },
    },
    // Energy: starts full, +1 every turn, small cap.
    AS: { name: 'Energy', cap: t.AS.cap, start: t.AS.start, defaultCost: t.AS.sCost, gain: () => t.AS.perTurn },
    // Tank: no bar, S cards cost HP.
    TK: { name: 'HP', cap: 0, start: 0, defaultCost: t.TK.sCost, payWithHp: true },
  }
}

/** Resources with the default numbers (no tuning). */
export const RESOURCES = resourcesFor(DEFAULT_TUNING)

// own log helper: state.ts imports this file, so importing state.ts back would be circular
const log = (state: GameState, line: string) => state.log.push(`T${state.turn} ${line}`)

const cache = new WeakMap<Tuning, Record<string, ResourceDef>>()
/** A class's resource under this game's tuning (default numbers when none is given). */
export const resourceOf = (championId: string, t?: Tuning): ResourceDef | undefined => {
  if (!t || t === DEFAULT_TUNING) return RESOURCES[championId]
  let r = cache.get(t)
  if (!r) cache.set(t, (r = resourcesFor(t)))
  return r[championId]
}

/** What this card costs its current holder. P/K cost nothing unless cards.cost says so. mod = the holder's loadout change to S costs. */
export function costOf(championId: string, card: CardInst, t?: Tuning, mod?: { pct: number; flat: number }): number {
  const def = resourceOf(championId, t)
  if (!def) return 0
  const base = card.def.cost != null ? Math.max(0, card.def.cost) : card.def.type === 'S' ? def.defaultCost : 0
  if (!mod || card.def.type !== 'S') return base
  return Math.max(0, Math.round((base * (100 + mod.pct)) / 100) + mod.flat)
}

/** Add n to a side's bar, kept between 0 and its cap. No-op for Tank. */
export function addRes(state: GameState, side: Side, n: number) {
  const p = state.players[side]
  const def = resourceOf(p.championId, tuningOf(state, side))
  if (!def || def.payWithHp) return
  p.res = Math.max(0, Math.min(def.cap, (p.res ?? 0) + n))
}

/** Pay for every card in the chain, in order. Cards that can't be paid go into p.unpaid (only drawbacks fire this turn). */
export function payChain(state: GameState, side: Side, chain: CardInst[]) {
  const p = state.players[side]
  const def = resourceOf(p.championId, tuningOf(state, side))
  p.unpaid = []
  if (!def || p.silenced || !state.rules.resources) return // Silenced: effects are off anyway, nothing to pay for
  for (const card of chain) {
    const cost = costOf(p.championId, card, tuningOf(state, side), p.costMod)
    // Bitter Cold: Skill effects are off, nothing to pay for
    if (cost <= 0 || (p.skillSilenced && card.def.type === 'S')) continue
    if (def.payWithHp ? p.hp > cost : (p.res ?? 0) >= cost) {
      if (def.payWithHp) {
        p.hp -= cost
        ;(state.events ??= []).push({ k: 'hp', side, delta: -cost })
      }
      else p.res = (p.res ?? 0) - cost
      log(state, `${side} pays ${cost} ${def.name} for ${card.def.id}`)
    } else {
      p.unpaid.push(card.uid)
      log(state, `${side} not enough ${def.name} for ${card.def.id} (needs ${cost}): ${def.unpaidStays ? 'can\'t play, stays on Field' : def.unpaidDmgPct != null ? `hits for ${def.unpaidDmgPct}% base dmg, drawbacks only` : 'hits, drawbacks only'}`)
    }
  }
}

/**
 * Bruiser-style classes: cards that couldn't be paid leave the chain and go back onto the Field, in order.
 * Returns the chain that actually strikes.
 */
export function holdUnpaid(state: GameState, side: Side, chain: CardInst[]): CardInst[] {
  const p = state.players[side]
  if (!p.unpaid?.length || !resourceOf(p.championId, tuningOf(state, side))?.unpaidStays) return chain
  p.hand = chain.filter((c) => p.unpaid!.includes(c.uid))
  p.unpaid = []
  return chain.filter((c) => !p.hand.includes(c))
}

/** End of turn: each class fills (or drains) its bar. */
export function gainRes(state: GameState, side: Side, t: TurnSummary) {
  if (!state.rules.resources) return
  const def = resourceOf(state.players[side].championId, tuningOf(state, side))
  const n = def?.gain?.(t) ?? 0
  if (n) addRes(state, side, n)
}

/** Base dmg of a card this turn: halved (or whatever the class says) when it went unpaid. */
export function baseDmgOf(state: GameState, side: Side, card: CardInst): number {
  const p = state.players[side]
  const pct = resourceOf(p.championId, tuningOf(state, side))?.unpaidDmgPct
  return pct != null && p.unpaid?.includes(card.uid) ? Math.floor((card.def.dmg * pct) / 100) : card.def.dmg
}

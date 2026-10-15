// Turn resolver. resolveTurn never mutates its input: it clones, resolves, returns the new state.
import { getEffect } from './effects/registry'
import { checkCombo } from './combos'
import { getStyle } from './styles'
import type { EffectSpec } from './effects/spec'
import type { ChainCtx } from './effects/types'
import { drawCards, log, loseHp, toDeckBottom } from './state'
import type { Action, CardDef, CardInst, CardType, GameState, Side } from './types'
import { other } from './types'

const SIDES: Side[] = ['p1', 'p2']

/** Per-turn bookkeeping shared by every effect this turn. */
type TurnEnv = {
  handAtStart: Record<Side, CardInst[]>
  hitsBlocked: Record<Side, number>
  hitDmgTaken: Record<Side, number>
  blockNow: Record<Side, number>
  /** Hits each side took that Block didn't stop. */
  hitsTaken: Record<Side, number>
}

export function legalActions(state: GameState, side: Side): Action[] {
  const p = state.players[side]
  const has = (k: string) => p.statuses.some((s) => s.kind === k)
  const out: Action[] = []
  if (p.hand.length > 0 && !has('noStrike')) out.push('strike')
  if (!has('noBlock')) out.push('block')
  if (!has('noCharge')) out.push('charge')
  return out.length ? out : ['block']
}

export function resolveTurn(prev: GameState, actions: Record<Side, Action>): GameState {
  if (prev.winner) return prev
  for (const side of SIDES) {
    if (!legalActions(prev, side).includes(actions[side])) {
      throw new Error(`${side} cannot ${actions[side]} this turn`)
    }
  }
  const state = structuredClone(prev)
  log(state, `p1 ${actions.p1} / p2 ${actions.p2}`)

  const handAtStart = { p1: [...state.players.p1.hand], p2: [...state.players.p2.hand] }
  const hitsBlocked: Record<Side, number> = { p1: 0, p2: 0 }
  const hitDmgTaken: Record<Side, number> = { p1: 0, p2: 0 }
  const blockNow: Record<Side, number> = { p1: 0, p2: 0 }
  const hitsTaken: Record<Side, number> = { p1: 0, p2: 0 }
  const env = { handAtStart, hitsBlocked, hitDmgTaken, blockNow, hitsTaken }

  // Every turn (before attack): right after actions are revealed, so its statuses count this turn
  resolveHeld(state, actions, env, 'onHeldBefore')

  // Block size and True Damage come from statuses active this turn, read before they tick
  const blockStops = { p1: blockStopsFor(state, 'p1'), p2: blockStopsFor(state, 'p2') }
  const trueDmg = { p1: hasStatus(state, 'p1', 'trueDmg'), p2: hasStatus(state, 'p2', 'trueDmg') }

  // statuses were checked above; they tick down now (new ones from this turn last into the next)
  for (const side of SIDES) {
    const p = state.players[side]
    p.statuses = p.statuses.map((s) => ({ ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0)
  }

  // runs every turn: Before action fires for held cards too (e.g. "if you played Charge"); After action ends it
  resolveStrikes(state, actions, env, blockStops, trueDmg)

  // Styles that react to this turn's hits
  for (const side of SIDES) {
    const enemy = other(side)
    const attacked = actions[enemy] === 'strike'
    getStyle(state.players[side].style)?.afterHits?.(state, side, {
      attacked,
      hitsTaken: hitsTaken[side],
      hitsBlocked: hitsBlocked[side],
      facing: attacked ? Math.min(handAtStart[enemy].length, handAtStart[side].length) : 0,
    })
  }
  resolveHeld(state, actions, env, 'onHeld')

  for (const side of SIDES) {
    if (actions[side] !== 'charge') continue
    const p = state.players[side]
    if (actions[other(side)] === 'strike') {
      // Strike > Charge: charger loses the oldest card if holding more than 1
      // (a Style like Tenacity can keep the first slots safe; the next card goes instead)
      const safe = getStyle(p.style)?.chargeBreakSafe?.(state, side) ?? 0
      if (p.hand.length > Math.max(1, safe)) {
        const lost = p.hand.splice(safe, 1)[0]
        toDeckBottom(state, side, [lost])
        log(state, `${side} เสีย ${lost.def.id} (โดนตีขณะ Charge)`)
      }
    } else {
      drawCards(state, side, state.rules.chargeDraw)
    }
  }

  if (actions.p1 === 'block' && actions.p2 === 'block') {
    state.blockStreak++
    if (state.blockStreak >= state.rules.blockStreakDiscard) {
      for (const side of SIDES) {
        const p = state.players[side]
        toDeckBottom(state, side, p.hand)
        p.hand = []
      }
      state.blockStreak = 0
      log(state, `Block ชน Block ${state.rules.blockStreakDiscard} ครั้ง: ทิ้งทั้งมือ`)
    }
  } else {
    state.blockStreak = 0
  }

  for (const side of SIDES) getStyle(state.players[side].style)?.endTurn?.(state, side)

  const dead = SIDES.filter((s) => state.players[s].hp <= 0)
  if (dead.length === 2) state.winner = 'draw'
  else if (dead.length === 1) state.winner = other(dead[0])
  state.turn++
  return state
}

const hasStatus = (state: GameState, side: Side, kind: string) => state.players[side].statuses.some((s) => s.kind === kind)

/** How many hits this side's Block stops: base rule + every active "Block ±N hit" status (never below 0). */
function blockStopsFor(state: GameState, side: Side): number {
  const extra = state.players[side].statuses.filter((s) => s.kind === 'blockPlus').reduce((t, s) => t + (s.n ?? 1), 0)
  return Math.max(0, state.rules.blockStopsHits + extra)
}

function resolveStrikes(
  state: GameState,
  actions: Record<Side, Action>,
  env: TurnEnv,
  blockStops: Record<Side, number>,
  trueDmg: Record<Side, boolean>,
) {
  const { handAtStart, hitsBlocked, hitDmgTaken } = env
  const strikers = SIDES.filter((s) => actions[s] === 'strike')
  const pending: Record<Side, number> = { p1: 0, p2: 0 }
  const chains: Partial<Record<Side, CardInst[]>> = {}
  const bonus: Partial<Record<Side, number[]>> = {}
  const mult: Partial<Record<Side, number[]>> = {}
  for (const side of strikers) {
    chains[side] = state.players[side].hand
    state.players[side].hand = [] // Strike uses the whole hand
    bonus[side] = chains[side].map(() => 0)
    mult[side] = chains[side].map(() => 1)
  }

  // held = a card in the hand of a side that didn't Strike (it has no chain of its own)
  const ctxFor = (side: Side, slot: number, blocked: boolean, clean = false, held = false): ChainCtx => {
    const enemy = other(side)
    return {
      state,
      self: side,
      enemy,
      card: held ? handAtStart[side][slot] : chains[side]![slot],
      pending,
      slot,
      chain: held ? [] : chains[side]!,
      enemyChain: chains[enemy] ?? null,
      selfAction: actions[side],
      enemyAction: actions[enemy],
      handAtStart,
      hitsBlocked,
      hitDmgTaken,
      blockNow: env.blockNow,
      bonus: held ? [] : bonus[side]!,
      enemyBonus: bonus[enemy] ?? null,
      mult: held ? [] : mult[side]!,
      enemyMult: mult[enemy] ?? null,
      blocked,
      clean,
    }
  }

  // 1) Before action: chain auras, plus held cards of a side that didn't Strike (e.g. "if you played Charge")
  for (const side of SIDES) {
    if (actions[side] === 'strike') chains[side]!.forEach((card, i) => getEffect(card.def)?.modify?.(ctxFor(side, i, false)))
    else handAtStart[side].forEach((card, i) => getEffect(card.def)?.modify?.(ctxFor(side, i, false, false, true)))
  }

  const stops = (side: Side) => Math.max(0, blockStops[side] + env.blockNow[side])
  const isBlocked = (side: Side, i: number) => actions[other(side)] === 'block' && i < stops(other(side))
  const dmgOf = (side: Side, i: number) => {
    const card = chains[side]![i]
    // True Damage: dmg cuts (negative bonus, multiplier below 1) don't apply; only Block stops the hit
    const b = trueDmg[side] ? Math.max(0, bonus[side]![i]) : bonus[side]![i]
    const m = trueDmg[side] ? Math.max(1, mult[side]![i]) : mult[side]![i]
    const raw = card.def.dmg + (card.grow ?? 0) + (card.growNext ?? 0) + b
    return Math.max(0, Math.floor(raw * m))
  }
  // Styles that boost the chain (e.g. Fury)
  for (const side of strikers) getStyle(state.players[side].style)?.beforeHits?.(state, side, bonus[side]!, mult[side]!)

  // dmg each side will take from hits this turn is known now (later effects can't change it)
  for (const side of strikers) {
    chains[side]!.forEach((_, i) => {
      if (!isBlocked(side, i)) hitDmgTaken[other(side)] += dmgOf(side, i)
    })
  }

  // 2) hits, slot by slot (both chains interleave when Strike meets Strike)
  const cleanHits: Record<Side, number> = { p1: 0, p2: 0 }
  const hitResults = new Map<string, { blocked: boolean; clean: boolean }>()
  const longest = Math.max(...strikers.map((s) => chains[s]!.length))
  for (let i = 0; i < longest; i++) {
    for (const side of strikers) {
      const card = chains[side]![i]
      if (!card) continue
      const enemy = other(side)
      const blocked = isBlocked(side, i)
      if (blocked) hitsBlocked[enemy]++
      const usedNext = card.growNext ?? 0
      const dmg = dmgOf(side, i)
      if (!blocked) {
        loseHp(state, enemy, dmg)
        env.hitsTaken[enemy]++
      }
      log(state, `${side} ช่อง ${i + 1} ${card.def.id} ${blocked ? 'โดน Block' : `ตี ${dmg}`}`)
      if (!blocked && dmg > 0) cleanHits[side]++
      hitResults.set(card.uid, { blocked, clean: !blocked && dmg > 0 })
      if (usedNext) card.growNext = (card.growNext ?? 0) - usedNext || undefined
    }
  }

  // Signature combos (3 cards in a row with the right P/K/S types)
  for (const side of strikers) {
    checkCombo(state, side, chains[side]!.map((c) => ({ type: c.def.type, ...(hitResults.get(c.uid) ?? { blocked: false, clean: false }) })))
  }

  // Styles that add to a finished chain (e.g. Sonic Bliz extra hits)
  for (const side of strikers) {
    const foe = state.players[other(side)]
    const hpBefore = foe.hp
    const extra = getStyle(state.players[side].style)?.afterChain?.(state, side, {
      chainLength: chains[side]!.length,
      cleanHits: cleanHits[side],
      enemyField: handAtStart[other(side)].length,
    })
    if (extra) env.hitsTaken[other(side)] += extra
    hitDmgTaken[other(side)] += hpBefore - foe.hp // extra hits count as hit dmg (e.g. "you take N+ dmg")
  }

  // 3) used cards go under the deck, then draws from effects enter the hand
  for (const side of strikers) toDeckBottom(state, side, chains[side]!)
  for (const side of SIDES) if (pending[side]) drawCards(state, side, pending[side])

  // 4) After action (Q 2026-10-15): end of the turn, every card that was on the Field when actions were
  //    revealed, whatever action its side picked. Struck cards still know how their hit went.
  for (const side of SIDES) {
    const struck = actions[side] === 'strike'
    handAtStart[side].forEach((card, i) => {
      const fx = getEffect(card.def)
      if (!fx?.onResolve && !fx?.onClean && !fx?.onBlocked) return
      const r = hitResults.get(card.uid) ?? { blocked: false, clean: false }
      const ctx = { ...ctxFor(side, i, r.blocked, r.clean, !struck), pending: null }
      fx.onResolve?.(ctx)
      if (r.blocked) fx.onBlocked?.(ctx)
      else if (r.clean) fx.onClean?.(ctx)
    })
  }
}

// Every turn: cards on the Field of a side that didn't Strike.
// onHeldBefore = before any hit; onHeld = after hits land, before Charge draws.
function resolveHeld(
  state: GameState,
  actions: Record<Side, Action>,
  env: TurnEnv,
  hook: 'onHeld' | 'onHeldBefore',
) {
  const { handAtStart, hitsBlocked, hitDmgTaken, blockNow } = env
  for (const side of SIDES) {
    if (actions[side] === 'strike') continue
    handAtStart[side].forEach((card, slot) => {
      getEffect(card.def)?.[hook]?.({
        state,
        self: side,
        enemy: other(side),
        card,
        pending: null,
        slot,
        chain: [],
        enemyChain: null,
        selfAction: actions[side],
        enemyAction: actions[other(side)],
        handAtStart,
        hitsBlocked,
        hitDmgTaken,
        blockNow,
        bonus: [],
        enemyBonus: null,
        mult: [],
        enemyMult: null,
        blocked: false,
        clean: false,
      })
    })
  }
}

// ---------- data loading ----------

export type CardRowLike = {
  id: string
  type: CardType
  dmg: number
  effect: string
  copies: number
  in_deck?: boolean
  effect_json?: EffectSpec | null
}

/** DB rows → deck list, expanded by copies. Rows with in_deck = false are left out. */
export function buildDeck(rows: CardRowLike[]): CardDef[] {
  return rows
    .filter((r) => r.in_deck !== false)
    .flatMap((r) => Array.from({ length: r.copies }, () => ({
      id: r.id,
      type: r.type,
      dmg: r.dmg,
      effectText: r.effect,
      effectSpec: r.effect_json ?? null,
    })))
}

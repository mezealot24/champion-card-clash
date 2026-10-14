// Turn resolver. resolveTurn never mutates its input: it clones, resolves, returns the new state.
import { getEffect } from './effects/registry'
import type { EffectSpec } from './effects/spec'
import type { ChainCtx } from './effects/types'
import { drawCards, log, loseHp, toDeckBottom } from './state'
import type { Action, CardDef, CardInst, CardType, GameState, Side } from './types'
import { other } from './types'

const SIDES: Side[] = ['p1', 'p2']

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

  // Block size comes from statuses active this turn, read before they tick
  const blockStops = { p1: blockStopsFor(state, 'p1'), p2: blockStopsFor(state, 'p2') }

  // statuses were checked above; they tick down now (new ones from this turn last into the next)
  for (const side of SIDES) {
    const p = state.players[side]
    p.statuses = p.statuses.map((s) => ({ ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0)
  }

  const handAtStart = { p1: [...state.players.p1.hand], p2: [...state.players.p2.hand] }

  const hitsBlocked: Record<Side, number> = { p1: 0, p2: 0 }
  const hitDmgTaken: Record<Side, number> = { p1: 0, p2: 0 }
  if (actions.p1 === 'strike' || actions.p2 === 'strike') resolveStrikes(state, actions, handAtStart, blockStops, hitsBlocked, hitDmgTaken)
  resolveHeld(state, actions, handAtStart, hitsBlocked, hitDmgTaken)

  for (const side of SIDES) {
    if (actions[side] !== 'charge') continue
    const p = state.players[side]
    if (actions[other(side)] === 'strike') {
      // Strike > Charge: charger loses the oldest card if holding more than 1
      if (p.hand.length > 1) {
        const lost = p.hand.shift()!
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

  const dead = SIDES.filter((s) => state.players[s].hp <= 0)
  if (dead.length === 2) state.winner = 'draw'
  else if (dead.length === 1) state.winner = other(dead[0])
  state.turn++
  return state
}

/** How many hits this side's Block stops: base rule + every active "Block +N hit" status. */
function blockStopsFor(state: GameState, side: Side): number {
  const extra = state.players[side].statuses.filter((s) => s.kind === 'blockPlus').reduce((t, s) => t + (s.n ?? 1), 0)
  return state.rules.blockStopsHits + extra
}

function resolveStrikes(
  state: GameState,
  actions: Record<Side, Action>,
  handAtStart: Record<Side, CardInst[]>,
  blockStops: Record<Side, number>,
  hitsBlocked: Record<Side, number>,
  hitDmgTaken: Record<Side, number>,
) {
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
      bonus: held ? [] : bonus[side]!,
      enemyBonus: bonus[enemy] ?? null,
      mult: held ? [] : mult[side]!,
      enemyMult: mult[enemy] ?? null,
      blocked,
      clean,
    }
  }

  // 1) Before attack: chain auras, plus held cards of a side that didn't Strike (e.g. "if you played Charge")
  for (const side of SIDES) {
    if (actions[side] === 'strike') chains[side]!.forEach((card, i) => getEffect(card.def)?.modify?.(ctxFor(side, i, false)))
    else handAtStart[side].forEach((card, i) => getEffect(card.def)?.modify?.(ctxFor(side, i, false, false, true)))
  }

  const isBlocked = (side: Side, i: number) => actions[other(side)] === 'block' && i < blockStops[other(side)]
  const dmgOf = (side: Side, i: number) => {
    const card = chains[side]![i]
    const raw = card.def.dmg + (card.grow ?? 0) + (card.growNext ?? 0) + bonus[side]![i]
    return Math.max(0, Math.floor(raw * mult[side]![i]))
  }
  // dmg each side will take from hits this turn is known now (later effects can't change it)
  for (const side of strikers) {
    chains[side]!.forEach((_, i) => {
      if (!isBlocked(side, i)) hitDmgTaken[other(side)] += dmgOf(side, i)
    })
  }

  // 2) hits, slot by slot (both chains interleave when Strike meets Strike)
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
      if (!blocked) loseHp(state, enemy, dmg)
      log(state, `${side} ช่อง ${i + 1} ${card.def.id} ${blocked ? 'โดน Block' : `ตี ${dmg}`}`)
      const fx = getEffect(card.def)
      const ctx = ctxFor(side, i, blocked, !blocked && dmg > 0)
      fx?.onResolve?.(ctx)
      if (blocked) fx?.onBlocked?.(ctx)
      else if (dmg > 0) fx?.onClean?.(ctx)
      if (usedNext) card.growNext = (card.growNext ?? 0) - usedNext || undefined
    }
  }

  // 3) used cards go under the deck, then draws from effects enter the hand
  for (const side of strikers) toDeckBottom(state, side, chains[side]!)
  for (const side of SIDES) if (pending[side]) drawCards(state, side, pending[side])
}

// onHeld: cards that stayed in hand this turn (we didn't Strike), after hits land, before Charge draws
function resolveHeld(
  state: GameState,
  actions: Record<Side, Action>,
  handAtStart: Record<Side, CardInst[]>,
  hitsBlocked: Record<Side, number>,
  hitDmgTaken: Record<Side, number>,
) {
  for (const side of SIDES) {
    if (actions[side] === 'strike') continue
    handAtStart[side].forEach((card, slot) => {
      getEffect(card.def)?.onHeld?.({
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

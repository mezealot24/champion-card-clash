// Turn resolver. resolveTurn never mutates its input: it clones, resolves, returns the new state.
import { applyConqueror, checkCombos, lifestealPct } from './combos'
import { getStyle } from './styles'
import { addRes, baseDmgOf, gainRes, payChain, resourceOf } from './resources'
import type { EffectSpec } from './effects/spec'
import type { ChainCtx } from './effects/types'
import { drawCards, effectOf, heal, log, loseHp, toDeckBottom } from './state'
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
  /** Extra % dmg each side takes from hits this turn (Vulnerable statuses, read before they tick). */
  vulnPct: Record<Side, number>
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
  for (const side of SIDES) {
    state.players[side].discarded = []
    state.players[side].cutTaken = 0
  }
  log(state, `p1 ${actions.p1} / p2 ${actions.p2}`)

  const handAtStart = { p1: [...state.players.p1.hand], p2: [...state.players.p2.hand] }
  const hitsBlocked: Record<Side, number> = { p1: 0, p2: 0 }
  const hitDmgTaken: Record<Side, number> = { p1: 0, p2: 0 }
  const blockNow: Record<Side, number> = { p1: 0, p2: 0 }
  const hitsTaken: Record<Side, number> = { p1: 0, p2: 0 }
  const vulnPct: Record<Side, number> = { p1: 0, p2: 0 }
  const env = { handAtStart, hitsBlocked, hitDmgTaken, blockNow, hitsTaken, vulnPct }

  // Silence: a side Silenced at the start of the turn has no card effects all turn
  for (const side of SIDES) state.players[side].silenced = hasStatus(state, side, 'silence')

  // Every turn (before attack): right after actions are revealed, so its statuses count this turn
  resolveHeld(state, actions, env, 'onHeldBefore')

  // Block size and True Damage come from statuses active this turn, read before they tick
  const blockStops = { p1: blockStopsFor(state, 'p1'), p2: blockStopsFor(state, 'p2') }
  const trueDmg = { p1: hasStatus(state, 'p1', 'trueDmg'), p2: hasStatus(state, 'p2', 'trueDmg') }
  const guardBreak = { p1: hasStatus(state, 'p1', 'guardBreak'), p2: hasStatus(state, 'p2', 'guardBreak') }
  for (const side of SIDES) vulnPct[side] = state.players[side].statuses.filter((s) => s.kind === 'vulnerable').reduce((t, s) => t + (s.n ?? 0), 0)

  // statuses were checked above; they tick down now (new ones from this turn last into the next).
  // Shields tick at the end of the turn instead, so a Shield still guards this turn's hits.
  const oldShields = SIDES.flatMap((side) => state.players[side].statuses.filter((s) => s.kind === 'shield'))
  for (const side of SIDES) {
    const p = state.players[side]
    p.statuses = p.statuses.map((s) => (s.kind === 'shield' ? s : { ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0)
  }

  // runs every turn: Before action fires for held cards too (e.g. "if you played Charge"); After action ends it
  const cleanHits = resolveStrikes(state, actions, env, blockStops, trueDmg, guardBreak)

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
      // Strike > Charge: Charge break (Q 2026-10-16). The oldest card goes to the bottom of the deck and a new one is
      // drawn in its place, even if it was the only card. A Style like Tenacity can keep the first slots safe:
      // the next card goes instead, and with no card beyond the safe slots nothing is lost.
      const safe = getStyle(p.style)?.chargeBreakSafe?.(state, side) ?? 0
      if (p.hand.length > safe) {
        const lost = p.hand.splice(safe, 1)[0]
        p.discarded!.push({ card: lost, slot: safe + 1, reason: 'Charge break' })
        toDeckBottom(state, side, [lost])
        log(state, `${side} เสีย ${lost.def.id} (โดนตีขณะ Charge) → ลงใต้กอง จั่วใบใหม่แทน`)
        drawCards(state, side, 1)
      }
    } else {
      drawCards(state, side, state.rules.chargeDraw + (getStyle(p.style)?.chargeDraw ?? 0))
    }
  }

  if (actions.p1 === 'block' && actions.p2 === 'block') {
    state.blockStreak++
    if (state.blockStreak >= state.rules.blockStreakDiscard) {
      for (const side of SIDES) {
        const p = state.players[side]
        p.discarded!.push(...p.hand.map((card, i) => ({ card, slot: i + 1, reason: 'Block streak' })))
        toDeckBottom(state, side, p.hand)
        p.hand = []
      }
      state.blockStreak = 0
      log(state, `Block ชน Block ${state.rules.blockStreakDiscard} ครั้ง: ทิ้งทั้งมือ`)
    }
  } else {
    state.blockStreak = 0
  }

  // class resources fill at the end of the turn, so what you earn now is spent next turn
  for (const side of SIDES) {
    gainRes(state, side, { action: actions[side], enemyAction: actions[other(side)], hitsTaken: hitsTaken[side], cleanHits: cleanHits[side] })
  }
  // Dual Strike Styles (Sonic Bliz Acceleration): after resources fill, so a full bar stays full
  if (actions.p1 === 'strike' && actions.p2 === 'strike') {
    for (const side of SIDES) {
      const ds = getStyle(state.players[side].style)?.dualStrike
      if (!ds) continue
      const cap = resourceOf(state.players[side].championId)?.cap ?? 0
      if (ds.fillRes && state.rules.resources) addRes(state, side, cap)
      const n = ds.draw ? drawCards(state, side, ds.draw) : 0
      log(state, `${side} Acceleration (Dual Strike): ${ds.fillRes ? 'Energy เต็ม, ' : ''}จั่ว ${n}`)
    }
  }
  for (const side of SIDES) getStyle(state.players[side].style)?.endTurn?.(state, side, actions[side])
  for (const side of SIDES) {
    const p = state.players[side]
    p.silenced = false
    p.unpaid = undefined
    // Shields from before this turn lose a turn; used-up or expired ones go
    for (const s of p.statuses) if (oldShields.includes(s)) s.turns--
    p.statuses = p.statuses.filter((s) => s.kind !== 'shield' || (s.turns > 0 && (s.n ?? 0) > 0))
  }

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
  guardBreak: Record<Side, boolean>,
): Record<Side, number> {
  const { handAtStart, hitsBlocked, hitDmgTaken } = env
  const strikers = SIDES.filter((s) => actions[s] === 'strike')
  const pending: Record<Side, number> = { p1: 0, p2: 0 }
  const chains: Partial<Record<Side, CardInst[]>> = {}
  const bonus: Partial<Record<Side, number[]>> = {}
  const mult: Partial<Record<Side, number[]>> = {}
  const pierce: Partial<Record<Side, number[]>> = {}
  for (const side of strikers) {
    chains[side] = state.players[side].hand
    state.players[side].hand = [] // Strike uses the whole hand
    // resource costs, in chain order: an unpaid card still hits but only its drawbacks fire this turn
    // (Bruiser: base dmg also drops to 50%)
    payChain(state, side, chains[side])
    bonus[side] = chains[side].map(() => 0)
    mult[side] = chains[side].map(() => 1)
    pierce[side] = chains[side].map(() => 0)
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
      pierce: held ? [] : pierce[side]!,
      blocked,
      clean,
    }
  }

  // 1) Before action: chain auras, plus held cards of a side that didn't Strike (e.g. "if you played Charge")
  for (const side of SIDES) {
    if (actions[side] === 'strike') chains[side]!.forEach((card, i) => effectOf(state, side, card)?.modify?.(ctxFor(side, i, false)))
    else handAtStart[side].forEach((card, i) => effectOf(state, side, card)?.modify?.(ctxFor(side, i, false, false, true)))
  }

  const stops = (side: Side) => Math.max(0, blockStops[side] + env.blockNow[side])
  // Pierce: a hit marked by an effect ignores Block
  const isBlocked = (side: Side, i: number) => actions[other(side)] === 'block' && i < stops(other(side)) && !pierce[side]![i]
  const dmgOf = (side: Side, i: number) => {
    const card = chains[side]![i]
    // True Damage: dmg cuts (negative bonus, multiplier below 1) don't apply; only Block stops the hit
    const b = trueDmg[side] ? Math.max(0, bonus[side]![i]) : bonus[side]![i]
    const m = trueDmg[side] ? Math.max(1, mult[side]![i]) : mult[side]![i]
    const raw = baseDmgOf(state, side, card) + (card.grow ?? 0) + (card.growNext ?? 0) + b
    // Vulnerable: the side being hit takes N% more dmg from every hit
    return Math.max(0, Math.floor((raw * m * (100 + env.vulnPct[other(side)])) / 100))
  }
  // Before action combos (card types only), then Conqueror stacks
  for (const side of strikers) checkCombos(state, side, chains[side]!.map((c) => ({ type: c.def.type, blocked: false, clean: false })), 'before')
  for (const side of SIDES) applyConqueror(state, side, actions, bonus[side], mult[other(side)])
  // Guard Crush: a hit stopped by Block still deals half (rounded down)
  const dealtOf = (side: Side, i: number) => (!isBlocked(side, i) ? dmgOf(side, i) : guardBreak[side] ? Math.floor(dmgOf(side, i) / 2) : 0)

  // Styles that boost the chain (e.g. Fury); crit = slots a Style marked as Critical (shown in the log)
  const crit: Record<Side, Set<number>> = { p1: new Set(), p2: new Set() }
  for (const side of strikers) getStyle(state.players[side].style)?.beforeHits?.(state, side, bonus[side]!, mult[side]!, crit[side], chains[side]!)

  // Every hit's outcome is worked out now, in hit order: Block, then Parry, then Shield, then HP.
  // So dmg each side will take from hits this turn is known before any hit lands.
  const longest = Math.max(...strikers.map((s) => chains[s]!.length))
  const outcome = new Map<string, { dealt: number; parried: boolean; absorbed: number }>()
  const sized = (side: Side, kind: 'shield' | 'parry') => state.players[side].statuses.filter((s) => s.kind === kind && (s.n ?? 0) > 0)
  for (let i = 0; i < longest; i++) {
    for (const side of strikers) {
      const card = chains[side]![i]
      if (!card) continue
      const enemy = other(side)
      let dealt = dealtOf(side, i)
      const parry = !isBlocked(side, i) && dealt > 0 ? sized(enemy, 'parry')[0] : undefined
      if (parry) parry.n = (parry.n ?? 1) - 1
      let absorbed = 0
      if (!parry) {
        for (const sh of sized(enemy, 'shield')) {
          const take = Math.min(sh.n ?? 0, dealt - absorbed)
          sh.n = (sh.n ?? 0) - take
          absorbed += take
        }
      }
      if (parry) dealt = 0
      else dealt -= absorbed
      outcome.set(card.uid, { dealt, parried: !!parry, absorbed })
      hitDmgTaken[enemy] += dealt
    }
  }
  for (const side of SIDES) state.players[side].statuses = state.players[side].statuses.filter((s) => s.kind !== 'parry' || (s.n ?? 0) > 0)

  // 2) hits, slot by slot (both chains interleave when Strike meets Strike)
  const cleanHits: Record<Side, number> = { p1: 0, p2: 0 }
  const hitResults = new Map<string, { blocked: boolean; clean: boolean }>()
  for (let i = 0; i < longest; i++) {
    for (const side of strikers) {
      const card = chains[side]![i]
      if (!card) continue
      const enemy = other(side)
      const blocked = isBlocked(side, i)
      if (blocked) hitsBlocked[enemy]++
      const usedNext = card.growNext ?? 0
      const dmg = dmgOf(side, i)
      const { dealt, parried, absorbed } = outcome.get(card.uid)!
      if (!blocked && !parried) env.hitsTaken[enemy]++
      if (dealt > 0) loseHp(state, enemy, dealt)
      if (parried && dmg > 0) loseHp(state, side, dmg)
      const critTag = crit[side].has(i) ? ' 💥 Critical' : ''
      const guard = parried ? ` (${enemy} Parry: สะท้อน ${dmg} กลับ)` : absorbed ? ` (Shield กัน ${absorbed})` : ''
      log(state, `${side} ช่อง ${i + 1} ${card.def.id} ${blocked ? `โดน Block${dealt ? ` (Guard Crush ทะลุ ${dealt})` : ''}${critTag}` : `ตี ${dmg}${critTag}${guard}`}`)
      const ls = Math.floor((dealt * lifestealPct(state, side)) / 100)
      if (ls > 0) {
        heal(state, side, ls)
        log(state, `${side} Omnivamp ฮีล ${ls}`)
      }
      // clean = some dmg got through Block, Parry and Shield (GDD)
      const clean = !blocked && dealt > 0
      if (clean) cleanHits[side]++
      hitResults.set(card.uid, { blocked, clean })
      if (usedNext) card.growNext = (card.growNext ?? 0) - usedNext || undefined
    }
  }

  // Guard Crush is used up by this Strike: if the opponent Blocked it, they lose their 2 oldest Field cards.
  // Then signature combos that look at how the hits went
  for (const side of strikers) {
    const p = state.players[side]
    if (guardBreak[side]) {
      p.statuses = p.statuses.filter((s) => s.kind !== 'guardBreak')
      const enemy = other(side)
      if (actions[enemy] === 'block') {
        const lost = state.players[enemy].hand.splice(0, 2)
        state.players[enemy].discarded!.push(...lost.map((card, i) => ({ card, slot: i + 1, reason: 'Guard Crush' })))
        toDeckBottom(state, enemy, lost)
        if (lost.length) log(state, `${side} Guard Crush: ${enemy} ทิ้ง ${lost.map((c) => c.def.id).join(', ')}`)
      }
    }
    checkCombos(state, side, chains[side]!.map((c) => ({ type: c.def.type, ...(hitResults.get(c.uid) ?? { blocked: false, clean: false }) })), 'after')
  }

  // Styles that add to a finished chain (extra hits; none use it now)
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
      // a card held back from the chain (unpaid Bruiser S) took no part in the Strike: no After action
      const slot = struck ? chains[side]!.indexOf(card) : i
      if (slot < 0) return
      const fx = effectOf(state, side, card)
      if (!fx?.onResolve && !fx?.onClean && !fx?.onBlocked) return
      const r = hitResults.get(card.uid) ?? { blocked: false, clean: false }
      const ctx = { ...ctxFor(side, slot, r.blocked, r.clean, !struck), pending: null }
      fx.onResolve?.(ctx)
      if (r.blocked) fx.onBlocked?.(ctx)
      else if (r.clean) fx.onClean?.(ctx)
    })
  }
  return cleanHits
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
      effectOf(state, side, card)?.[hook]?.({
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
        pierce: [],
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
  cost?: number | null
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
      cost: r.cost ?? null,
    })))
}

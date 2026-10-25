// Turn resolver. resolveTurn never mutates its input: it clones, resolves, returns the new state.
import { applyConqueror, checkCombos, lifestealPct } from './combos'
import { chillCut, getStyle, hooksOf, igniteBurn, igniteStacks } from './styles'
import { addRes, baseDmgOf, gainRes, payChain, resourceOf, SURGE_CHAMPION, SURGE_MODES } from './resources'
import type { EffectSpec } from './effects/spec'
import { tuningOf } from './tuning'
import type { ChainCtx, HitIn } from './effects/types'
import { drawCards, effectOf, emit, heal, log, loseHp, markDiscarded, toDeckBottom } from './state'
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
  chillPct: Record<Side, number>
  /** Energy Surge this turn: Wraith Step (Block), Shroud (Charge), Elusive (Strike). */
  wraith: Record<Side, boolean>
  shroud: Record<Side, boolean>
  elusive: Record<Side, boolean>
  /** Enemy hits each side received this turn, by slot and type (filled once hit outcomes are known). */
  hitsIn: Record<Side, HitIn[]>
  /** Hits a Shield soaked dmg from (Frost Armor). */
  shieldHits: Record<Side, number>
  /** Punch / Kick cards that hit clean this turn (Mage Mana). */
  cleanPK: Record<Side, number>
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
  state.events = []
  log(state, `p1 ${actions.p1} / p2 ${actions.p2}`)

  const handAtStart = { p1: [...state.players.p1.hand], p2: [...state.players.p2.hand] }
  const hitsBlocked: Record<Side, number> = { p1: 0, p2: 0 }
  const hitDmgTaken: Record<Side, number> = { p1: 0, p2: 0 }
  const blockNow: Record<Side, number> = { p1: 0, p2: 0 }
  const hitsTaken: Record<Side, number> = { p1: 0, p2: 0 }
  const shieldHits: Record<Side, number> = { p1: 0, p2: 0 }
  const vulnPct: Record<Side, number> = { p1: 0, p2: 0 }
  const hitsIn: Record<Side, HitIn[]> = { p1: [], p2: [] }
  const chillPct: Record<Side, number> = { p1: 0, p2: 0 }
  // Energy Surge (Assassin): a full bar at the start of the turn is spent by the action picked (see resources.ts)
  const surge: Record<Side, number> = { p1: 0, p2: 0 }
  for (const side of SIDES) {
    const p = state.players[side]
    const def = resourceOf(p.championId, tuningOf(state, side))
    // Wraith Form (Assassin Ascendancy): the bar counts as full a little early
    const less = Math.max(0, ...hooksOf(p).map((h) => h.surgeLess?.(state, side) ?? 0))
    if (!state.rules.resources || p.championId !== SURGE_CHAMPION || !def || (p.res ?? 0) <= 0 || (p.res ?? 0) < def.cap - less) continue
    const mode = actions[side] === 'block' ? 'A' : actions[side] === 'charge' ? 'B' : 'C'
    if (!SURGE_MODES.includes(mode)) continue
    surge[side] = p.res ?? 0
    p.res = 0
    const what = mode === 'A' ? 'Wraith Step (hits through Block deal only 1)' : mode === 'B' ? 'Shroud (no charge break, half dmg)' : 'Elusive (enemy Block stops 1 less)'
    log(state, `${side} Energy Surge: spends all ${surge[side]} Energy → ${what}`)
  }
  const surgeOn = (side: Side, a: Action) => surge[side] > 0 && actions[side] === a
  const env = { handAtStart, hitsBlocked, hitDmgTaken, blockNow, hitsTaken, shieldHits, vulnPct, chillPct, wraith: { p1: surgeOn('p1', 'block'), p2: surgeOn('p2', 'block') }, shroud: { p1: surgeOn('p1', 'charge'), p2: surgeOn('p2', 'charge') }, elusive: { p1: surgeOn('p1', 'strike'), p2: surgeOn('p2', 'strike') }, cleanPK: { p1: 0, p2: 0 }, hitsIn }

  // Styles that act on the action picked (Molten Shield), before statuses are read
  for (const side of SIDES) for (const h of hooksOf(state.players[side])) h.actionStart?.(state, side, actions[side], actions[other(side)])

  // Silence: a side Silenced at the start of the turn has no card effects all turn
  for (const side of SIDES) state.players[side].silenced = hasStatus(state, side, 'silence')
  for (const side of SIDES) state.players[side].skillSilenced = hasStatus(state, side, 'skillSilence')

  // Every turn (before attack): right after actions are revealed, so its statuses count this turn
  resolveHeld(state, actions, env, 'onHeldBefore')

  // Block size and True Damage come from statuses active this turn, read before they tick
  const blockStops = { p1: blockStopsFor(state, 'p1'), p2: blockStopsFor(state, 'p2') }
  const trueDmg = { p1: hasStatus(state, 'p1', 'trueDmg'), p2: hasStatus(state, 'p2', 'trueDmg') }
  const guardBreak = { p1: hasStatus(state, 'p1', 'guardBreak'), p2: hasStatus(state, 'p2', 'guardBreak') }
  for (const side of SIDES) vulnPct[side] = state.players[side].statuses.filter((s) => s.kind === 'vulnerable').reduce((t, s) => t + (s.n ?? 0), 0)
  // Chill (Cryomancer): the chilled side's hits deal N% less this turn
  for (const side of SIDES) chillPct[side] = chillCut(state.players[side], tuningOf(state, other(side)))

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
    const report = {
      attacked,
      hitsTaken: hitsTaken[side],
      hitsBlocked: hitsBlocked[side],
      shieldHits: shieldHits[side],
      facing: attacked ? Math.min(handAtStart[enemy].length, handAtStart[side].length) : 0,
    }
    for (const h of hooksOf(state.players[side])) h.afterHits?.(state, side, report)
  }
  resolveHeld(state, actions, env, 'onHeld')

  for (const side of SIDES) {
    if (actions[side] !== 'charge') continue
    const p = state.players[side]
    if (actions[other(side)] === 'strike' && !env.shroud[side]) {
      // Strike > Charge: Charge break (Q 2026-10-16). The oldest card goes to the bottom of the deck, the cards behind
      // it move up a slot (2-3-4 become 1-2-3) and 1 new card is drawn onto the end (Q 2026-10-17), even if it was the
      // only card. A Style like Tenacity can keep the first slots safe: the next card goes instead, and with no card
      // beyond the safe slots nothing is lost. An empty Field loses nothing and still draws 1.
      const safe = Math.max(0, ...hooksOf(p).map((h) => h.chargeBreakSafe?.(state, side) ?? 0))
      if (p.hand.length > safe) {
        const lost = p.hand.splice(safe, 1)[0]
        markDiscarded(state, side, [{ card: lost, slot: safe + 1, reason: 'Charge break' }])
        toDeckBottom(state, side, [lost])
        log(state, `${side} loses ${lost.def.id} (hit while Charging) → deck bottom, draws a new card`)
        drawCards(state, side, 1)
      } else if (p.hand.length === 0) {
        // empty Field: nothing to lose, the Charge still draws 1 (Q 2026-10-17)
        drawCards(state, side, 1)
      }
    } else {
      const extra = hooksOf(p).reduce((t, h) => t + (h.chargeDraw ?? 0) + (h.extraChargeDraw?.(state, side) ?? 0), 0)
      drawCards(state, side, state.rules.chargeDraw + extra)
    }
  }

  if (actions.p1 === 'block' && actions.p2 === 'block') {
    state.blockStreak++
    if (state.blockStreak >= state.rules.blockStreakDiscard) {
      for (const side of SIDES) {
        const p = state.players[side]
        markDiscarded(state, side, p.hand.map((card, i) => ({ card, slot: i + 1, reason: 'Block streak' })))
        toDeckBottom(state, side, p.hand)
        p.hand = []
      }
      state.blockStreak = 0
      log(state, `Block vs Block ${state.rules.blockStreakDiscard} times: both Fields discarded`)
    }
  } else {
    state.blockStreak = 0
  }

  // class resources fill at the end of the turn, so what you earn now is spent next turn
  for (const side of SIDES) {
    const p = state.players[side]
    gainRes(state, side, { action: actions[side], enemyAction: actions[other(side)], hitsTaken: hitsTaken[side], cleanHits: cleanHits[side], cleanPK: env.cleanPK[side], foeDmg: p.otherDmg?.foe ?? 0, selfDmg: p.otherDmg?.self ?? 0, hpPct: (100 * p.hp) / Math.max(1, p.maxHp) })
    p.otherDmg = undefined
  }
  // Dual Strike Styles (Sonic Bliz Acceleration): after resources fill, so a full bar stays full
  // Mach Speed (Ascendancy): also when this side Strikes into a Charge
  for (const side of SIDES) {
    if (actions[side] !== 'strike') continue
    const hooks = hooksOf(state.players[side])
    const enemy = actions[other(side)]
    if (enemy !== 'strike' && !(enemy === 'charge' && hooks.some((h) => h.dualOnCharge))) continue
    const ds = getStyle(state.players[side].style)?.dualStrike
    if (!ds) continue
    const fill = ds.fillRes && !hooks.some((h) => h.noDualFill)
    const cap = resourceOf(state.players[side].championId, tuningOf(state, side))?.cap ?? 0
    if (fill && state.rules.resources) addRes(state, side, cap)
    const draw = ds.draw?.(tuningOf(state, side)) ?? 0
    const n = draw ? drawCards(state, side, draw) : 0
    log(state, `${side} Acceleration (${enemy === 'strike' ? 'Dual Strike' : 'Mach Speed'}): ${fill ? 'Energy full, ' : ''}draws ${n}`)
  }
  for (const side of SIDES) for (const h of hooksOf(state.players[side])) h.endTurn?.(state, side, actions[side], actions[other(side)])
  // Ignite burns at the end of every turn it's on (Pyromancer)
  for (const side of SIDES) {
    const burn = igniteBurn(state.players[side], tuningOf(state, other(side)))
    if (!burn) continue
    loseHp(state, side, burn)
    log(state, `${side} 🔥 Ignite ${igniteStacks(state.players[side])} stacks burn ${burn}`)
  }
  for (const side of SIDES) {
    const p = state.players[side]
    p.silenced = false
    p.skillSilenced = false
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

/** How many hits this side's Block stops: base rule + every active "Block ±N hit" status + loadout pieces (never below 0). */
function blockStopsFor(state: GameState, side: Side): number {
  const p = state.players[side]
  const extra = p.statuses.filter((s) => s.kind === 'blockPlus').reduce((t, s) => t + (s.n ?? 1), 0)
  const perks = hooksOf(p).reduce((t, h) => t + (h.blockBonus?.(state, side) ?? 0), 0)
  return Math.max(0, state.rules.blockStopsHits + extra + perks)
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
  const deathMarked = { p1: hasStatus(state, 'p1', 'deathMark'), p2: hasStatus(state, 'p2', 'deathMark') }
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
  // upTo = On hit only: "you've been hit by" counts enemy hits up to this card's slot
  const ctxFor = (side: Side, slot: number, blocked: boolean, clean = false, held = false, upTo?: number): ChainCtx => {
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
      hitsIn: env.hitsIn,
      hitsUpTo: upTo,
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
  const isBlocked = (side: Side, i: number) => actions[other(side)] === 'block' && i < stops(other(side)) - (env.elusive[side] ? 1 : 0) && !pierce[side]![i]
  const dmgOf = (side: Side, i: number) => {
    const card = chains[side]![i]
    // True Damage: dmg cuts (negative bonus, multiplier below 1) don't apply; only Block stops the hit
    const b = trueDmg[side] ? Math.max(0, bonus[side]![i]) : bonus[side]![i]
    const m = trueDmg[side] ? Math.max(1, mult[side]![i]) : mult[side]![i]
    const raw = baseDmgOf(state, side, card) + (card.grow ?? 0) + (card.growNext ?? 0) + b
    // Vulnerable: the side being hit takes N% more dmg from every hit; Chill: the striker's hits deal N% less
    return Math.max(0, Math.floor((raw * m * (100 + env.vulnPct[other(side)]) * (100 - env.chillPct[side])) / 10000))
  }
  // Before action combos (card types only), then Momentum stacks
  for (const side of strikers) checkCombos(state, side, chains[side]!.map((c) => ({ type: c.def.type, blocked: false, clean: false })), 'before')
  for (const side of strikers) for (const h of hooksOf(state.players[side])) h.strikeStart?.(state, side, chains[side]!)
  for (const side of SIDES) applyConqueror(state, side, actions, bonus[side], mult[other(side)])
  // Guard Crush: a hit stopped by Block still deals half (rounded down)
  // a blocked hit deals half under Guard Crush, or when a Style marked it Critical (Fatal Rhythm, Q 2026-10-16)
  // numbers of the striking side (its loadout may change them)
  const ts = (side: Side) => tuningOf(state, side)
  const throughPct = (side: Side, i: number) =>
    Math.min(100, Math.max(guardBreak[side] ? ts(side).BR.guardCrushBlockedPct : 0, crit[side].has(i) ? ts(side)['AS:2'].blockedCritPct : 0))
  // loadout Costs that make a side's Block leak: every blocked hit after its first still deals N% (Unrelenting)
  const blockLeak = { p1: 0, p2: 0 }
  for (const side of SIDES) blockLeak[side] = hooksOf(state.players[side]).reduce((t, h) => Math.max(t, h.blockLeakPct?.(state, side) ?? 0), 0)
  const leakPct = (side: Side, i: number) => {
    if (!blockLeak[other(side)]) return 0
    let earlier = 0
    for (let j = 0; j < i; j++) if (isBlocked(side, j)) earlier++
    return earlier >= 1 ? blockLeak[other(side)] : 0
  }
  const dealtOf = (side: Side, i: number) =>
    !isBlocked(side, i) ? dmgOf(side, i) : Math.floor((dmgOf(side, i) * Math.min(100, Math.max(throughPct(side, i), leakPct(side, i)))) / 100)

  // Styles that boost the chain (e.g. Fury); crit = slots a Style marked as Critical (shown in the log)
  const crit: Record<Side, Set<number>> = { p1: new Set(), p2: new Set() }
  for (const side of strikers) for (const h of hooksOf(state.players[side])) h.beforeHits?.(state, side, bonus[side]!, mult[side]!, crit[side], chains[side]!, pierce[side]!)
  // loadout pieces that soften every hit getting past a side's Block (Iron Hide)
  const hitCut = { p1: 0, p2: 0 }
  for (const side of SIDES) hitCut[side] = hooksOf(state.players[side]).reduce((t, h) => t + (h.hitCut?.(state, side) ?? 0), 0)

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
      // Energy Surge: Wraith Step caps hits past Block at 1, Shroud halves them
      if (env.wraith[enemy] && !isBlocked(side, i)) dealt = Math.min(dealt, 1)
      if (env.shroud[enemy]) dealt = Math.floor(dealt / 2)
      if (hitCut[enemy] && !isBlocked(side, i)) dealt = Math.max(0, dealt - hitCut[enemy])
      const parry = !isBlocked(side, i) && dealt > 0 ? sized(enemy, 'parry')[0] : undefined
      if (parry) parry.n = (parry.n ?? 1) - 1
      let absorbed = 0
      if (!parry) {
        for (const sh of sized(enemy, 'shield')) {
          const take = Math.min(sh.n ?? 0, dealt - absorbed)
          sh.n = (sh.n ?? 0) - take
          absorbed += take
        }
        if (absorbed) env.shieldHits[enemy]++
      }
      if (parry) dealt = 0
      else dealt -= absorbed
      outcome.set(card.uid, { dealt, parried: !!parry, absorbed })
      env.hitsIn[enemy].push({ slot: i, type: card.def.type, blocked: isBlocked(side, i), landed: !isBlocked(side, i) && !parry })
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
      emit(state, { k: 'hit', side, slot: i, uid: card.uid, type: card.def.type, dmg, dealt, blocked, parried, absorbed, crit: crit[side].has(i) })
      if (dealt > 0) loseHp(state, enemy, dealt, 'hit')
      const critTag = crit[side].has(i) ? ' 💥 Critical' : ''
      const guard = parried ? ` (${enemy} Parries ${dmg})` : absorbed ? ` (Shield absorbs ${absorbed})` : ''
      log(state, `${side} slot ${i + 1} ${card.def.id} ${blocked ? `Blocked${dealt ? ` (${crit[side].has(i) ? 'Critical' : 'Guard Crush'} through ${dealt})` : ''}${critTag}` : `hits ${dmg}${critTag}${guard}`}`)
      const ls = Math.floor((dealt * (lifestealPct(state, side) + hooksOf(state.players[side]).reduce((t, h) => t + (h.lifesteal?.(state, side) ?? 0), 0))) / 100)
      if (ls > 0 && heal(state, side, ls) > 0) {
        log(state, `${side} Lifesteal heals ${ls}`)
      }
      // clean = some dmg got through Block, Parry and Shield (GDD)
      const clean = !blocked && dealt > 0
      if (clean) cleanHits[side]++
      if (clean && card.def.type !== 'S') env.cleanPK[side]++
      hitResults.set(card.uid, { blocked, clean })
      // On hit: fires right here, between hits, so e.g. a heal lands before the next enemy hit (Q 2026-10-17)
      effectOf(state, side, card)?.onHit?.(ctxFor(side, i, blocked, clean, false, i))
      if (usedNext) card.growNext = (card.growNext ?? 0) - usedNext || undefined
    }
  }

  // Mark of Assassin (Assassin combo): a Strike against a marked opponent bursts for 50% of the chain's total dmg,
  // whatever Block / Shield let through (Claude reading of Q 2026-10-16: total = every card's dmg in the chain).
  // Lost straight from HP. A mark placed by this turn's combo only counts from the next Strike.
  for (const side of strikers) {
    if (!deathMarked[other(side)]) continue
    const total = chains[side]!.reduce((t, _, i) => t + dmgOf(side, i), 0)
    const burst = Math.floor((total * ts(side).AS.markBurstPct) / 100)
    if (burst <= 0) continue
    loseHp(state, other(side), burst)
    hitDmgTaken[other(side)] += burst
    log(state, `${side} 💀 Mark of Assassin bursts ${burst} (${ts(side).AS.markBurstPct}% of chain total ${total})`)
  }

  // Guard Crush is used up by this Strike: if the opponent Blocked it, they lose their 2 oldest Field cards.
  // Then signature combos that look at how the hits went
  for (const side of strikers) {
    const p = state.players[side]
    if (guardBreak[side]) {
      p.statuses = p.statuses.filter((s) => s.kind !== 'guardBreak')
      const enemy = other(side)
      if (actions[enemy] === 'block') {
        const lost = state.players[enemy].hand.splice(0, ts(side).BR.guardCrushDiscard)
        markDiscarded(state, enemy, lost.map((card, i) => ({ card, slot: i + 1, reason: 'Guard Crush' })))
        toDeckBottom(state, enemy, lost)
        if (lost.length) log(state, `${side} Guard Crush: ${enemy} discards ${lost.map((c) => c.def.id).join(', ')}`)
      }
    }
    checkCombos(state, side, chains[side]!.map((c) => ({ type: c.def.type, ...(hitResults.get(c.uid) ?? { blocked: false, clean: false }) })), 'after')
  }

  // Styles that add to a finished chain (⟡ Infuse, Arcane Sub-Zero; extra hits: none use it now)
  for (const side of strikers) {
    const foe = state.players[other(side)]
    const hpBefore = foe.hp
    const report = {
      chainLength: chains[side]!.length,
      cleanHits: cleanHits[side],
      enemyField: handAtStart[other(side)].length,
      skills: chains[side]!.filter((c) => c.def.type === 'S').length,
      paidSkills: chains[side]!.filter((c) => c.def.type === 'S' && !state.players[side].unpaid?.includes(c.uid)).length,
    }
    const extra = hooksOf(state.players[side]).reduce((t, h) => t + (h.afterChain?.(state, side, report) ?? 0), 0)
    if (extra) env.hitsTaken[other(side)] += extra
    hitDmgTaken[other(side)] += hpBefore - foe.hp // extra hits count as hit dmg (e.g. "you take N+ dmg")
  }

  // 3) used cards go under the deck, then draws from effects enter the hand
  for (const side of strikers) {
    toDeckBottom(state, side, chains[side]!)
    emit(state, { k: 'sweep', side, uids: chains[side]!.map((c) => c.uid) })
  }
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
        hitsIn: env.hitsIn,
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
  style_only?: string | null
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
      styleOnly: r.style_only ?? null,
    })))
}

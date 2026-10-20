// Small state helpers shared by the clash resolver and effect primitives.
// They mutate the draft GameState passed in (resolveTurn clones first).
import type { CardDef, CardInst, GameState, PlayerState, RulesConfig, Side, TurnEvent } from './types'
import { DEFAULT_RULES } from './types'
import { getEffect } from './effects/registry'
import { healAfterIgnite, hooksOf } from './styles'
import { applyLoadout, type Loadout } from './loadout'
import { resourceOf } from './resources'
import { resolveTuning, tuningOf, type Tuning, type TuningOverrides } from './tuning'

// --- seeded RNG (mulberry32) so a match can be replayed from its seed ---
export function nextRandom(state: GameState): number {
  let t = (state.rngSeed = (state.rngSeed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(state: GameState, items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type ChampionSetup = {
  championId: string
  hpStart: number
  hpMax: number
  deck: CardDef[] // already expanded by copies (see buildDeck)
  style?: string // "CHAMP:slot", see engine/styles.ts
  loadout?: Loadout // Sigils + Ascendancy nodes, see engine/loadout.ts
}

export function createGame(
  p1: ChampionSetup,
  p2: ChampionSetup,
  opts: { seed?: number; rules?: Partial<RulesConfig>; tuning?: Tuning | TuningOverrides } = {},
): GameState {
  // overrides from the DB (any subset) are filled in with the defaults
  const tuning = resolveTuning(opts.tuning as TuningOverrides | undefined)
  const state: GameState = {
    turn: 1,
    players: { p1: emptyPlayer(p1, 'p1', tuning), p2: emptyPlayer(p2, 'p2', tuning) },
    blockStreak: 0,
    winner: null,
    rules: { ...DEFAULT_RULES, ...opts.rules },
    tuning,
    rngSeed: opts.seed ?? Date.now() | 0,
    log: [],
  }
  for (const side of ['p1', 'p2'] as const) {
    const p = state.players[side]
    applyLoadout(p, (side === 'p1' ? p1 : p2).loadout, tuning)
    const t = tuningOf(state, side)
    for (const h of hooksOf(p)) h.setup?.(p, t)
    p.deck = shuffle(state, p.deck) // shuffle once; afterwards order is learnable
    drawCards(state, side, state.rules.startHand + hooksOf(p).reduce((n, h) => n + (h.startDraw?.(t) ?? 0), 0))
  }
  return state
}

/**
 * cards.style_only: "MG:1" = only in the deck under that Style (Pyromancer's own cards);
 * "!MG:1" = in the deck under every Style but that one (the cards those replace). Null = always.
 */
export function inStyleDeck(def: CardDef, style?: string): boolean {
  const k = def.styleOnly
  if (!k) return true
  return k.startsWith('!') ? k.slice(1) !== style : k === style
}

function emptyPlayer(setup: ChampionSetup, side: Side, t: Tuning): PlayerState {
  return {
    championId: setup.championId,
    hp: setup.hpStart,
    maxHp: setup.hpMax,
    hand: [],
    deck: setup.deck.filter((def) => inStyleDeck(def, setup.style)).map((def, i) => ({ uid: `${side}-${def.id}-${i}`, def })),
    statuses: [],
    style: setup.style,
    res: resourceOf(setup.championId, t)?.start ?? 0,
  }
}

/** A card's effect, or nothing while its owner is Silenced. */
/** A chain card whose resource cost couldn't be paid this turn keeps only its drawbacks (Q 2026-10-15). */
export function effectOf(state: GameState, side: Side, card: CardInst) {
  const p = state.players[side]
  return p.silenced || (p.skillSilenced && card.def.type === 'S') ? undefined : getEffect(card.def, !!p.unpaid?.includes(card.uid))
}

/**
 * Draw from the top of the deck into the hand. Stops at hand max. Fires onDraw.
 * Once a whole deck's worth of cards has been drawn (20 with a full deck), the deck reshuffles (Q 2026-10-15),
 * except the last handMax cards at the bottom: discards always go under the deck and stay there (Q 16:56Z).
 */
export function drawCards(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  let drawn = 0
  const max = handMaxOf(state, side)
  for (let i = 0; i < n && p.hand.length < max && p.deck.length > 0; i++) {
    const card = p.deck.shift()!
    p.hand.push(card)
    card.enteredWith = p.hand.length
    emit(state, { k: 'draw', side, card })
    drawn++
    p.drawsSinceShuffle = (p.drawsSinceShuffle ?? 0) + 1
    if (p.drawsSinceShuffle >= p.deck.length + p.hand.length) {
      // the newest cards at the bottom (just left the Field) stay there, so a discard is never drawn right back
      const keep = Math.min(p.deck.length, state.rules.handMax)
      p.deck = [...shuffle(state, p.deck.slice(0, p.deck.length - keep)), ...p.deck.slice(p.deck.length - keep)]
      p.drawsSinceShuffle = 0
      log(state, `${side} drew the whole deck: deck reshuffled`)
    }
    effectOf(state, side, card)?.onDraw?.({ state, self: side, enemy: side === 'p1' ? 'p2' : 'p1', card, pending: null })
  }
  return drawn
}

/** How many cards this side's Field holds (a loadout can close slots). */
export const handMaxOf = (state: GameState, side: Side) => Math.min(state.rules.handMax, state.players[side].fieldMax ?? state.rules.handMax)

/** Used / lost cards go to the bottom of the deck (deck never runs out). */
/** A stolen card goes back under its owner's deck. */
export function toDeckBottom(state: GameState, side: Side, cards: CardInst[]) {
  for (const card of cards) {
    const to = card.owner ?? side
    card.owner = undefined
    state.players[to].deck.push(card)
  }
}

/** Heal up to Max HP (Ignite cuts it by 25%); returns HP actually gained. A side already at 0 HP is down for good:
 *  heals later in the same turn (After action, Hold, combos, Lifesteal) can't bring it back (Q 2026-10-17). */
export function heal(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  if (p.hp <= 0) return 0
  n = healAfterIgnite(p, n, tuningOf(state, side === 'p1' ? 'p2' : 'p1'))
  const before = p.hp
  p.hp = Math.min(p.maxHp, p.hp + n)
  if (p.hp !== before) emit(state, { k: 'hp', side, delta: p.hp - before })
  return p.hp - before
}

/** from: 'hit' = a Strike chain card's hit; 'foe' / 'self' = any other HP loss, counted for Bruiser Rage (Q 2026-10-16). */
export function loseHp(state: GameState, side: Side, n: number, from: 'hit' | 'foe' | 'self' = 'foe') {
  const p = state.players[side]
  const before = p.hp
  p.hp = Math.max(0, p.hp - n)
  if (p.hp < before) for (const h of hooksOf(p)) h.onHpLoss?.(state, side)
  if (p.hp !== before) emit(state, { k: 'hp', side, delta: p.hp - before })
  if (from === 'hit' || p.hp >= before) return
  p.otherDmg ??= { foe: 0, self: 0 }
  p.otherDmg[from]++
}

/** Record a turn event for the battle screen (see TurnEvent). */
export function emit(state: GameState, ev: TurnEvent) {
  ;(state.events ??= []).push(ev)
}

/** Cards a side lost from its Field this turn (shown on the Field until the next turn). */
export function markDiscarded(state: GameState, side: Side, lost: { card: CardInst; slot: number; reason: string }[]) {
  const p = state.players[side]
  ;(p.discarded ??= []).push(...lost)
  for (const d of lost) emit(state, { k: 'discard', side, uid: d.card.uid, reason: d.reason })
}

export function log(state: GameState, line: string) {
  state.log.push(`T${state.turn} ${line}`)
}

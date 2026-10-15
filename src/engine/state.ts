// Small state helpers shared by the clash resolver and effect primitives.
// They mutate the draft GameState passed in (resolveTurn clones first).
import type { CardDef, CardInst, GameState, PlayerState, RulesConfig, Side } from './types'
import { DEFAULT_RULES } from './types'
import { getEffect } from './effects/registry'
import { getStyle } from './styles'

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
}

export function createGame(
  p1: ChampionSetup,
  p2: ChampionSetup,
  opts: { seed?: number; rules?: Partial<RulesConfig> } = {},
): GameState {
  const state: GameState = {
    turn: 1,
    players: { p1: emptyPlayer(p1, 'p1'), p2: emptyPlayer(p2, 'p2') },
    blockStreak: 0,
    winner: null,
    rules: { ...DEFAULT_RULES, ...opts.rules },
    rngSeed: opts.seed ?? Date.now() | 0,
    log: [],
  }
  for (const side of ['p1', 'p2'] as const) {
    const p = state.players[side]
    const style = getStyle(p.style)
    style?.setup?.(p)
    p.deck = shuffle(state, p.deck) // shuffle once; afterwards order is learnable
    drawCards(state, side, state.rules.startHand + (style?.startDraw ?? 0))
  }
  return state
}

function emptyPlayer(setup: ChampionSetup, side: Side): PlayerState {
  return {
    championId: setup.championId,
    hp: setup.hpStart,
    maxHp: setup.hpMax,
    hand: [],
    deck: setup.deck.map((def, i) => ({ uid: `${side}-${def.id}-${i}`, def })),
    statuses: [],
    style: setup.style,
  }
}

/** A card's effect, or nothing while its owner is Silenced. */
export function effectOf(state: GameState, side: Side, card: CardInst) {
  return state.players[side].silenced ? undefined : getEffect(card.def)
}

/**
 * Draw from the top of the deck into the hand. Stops at hand max. Fires onDraw.
 * Once a whole deck's worth of cards has been drawn (20 with a full deck), the deck reshuffles (Q 2026-10-15).
 */
export function drawCards(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  let drawn = 0
  for (let i = 0; i < n && p.hand.length < state.rules.handMax && p.deck.length > 0; i++) {
    const card = p.deck.shift()!
    p.hand.push(card)
    card.enteredWith = p.hand.length
    drawn++
    p.drawsSinceShuffle = (p.drawsSinceShuffle ?? 0) + 1
    if (p.drawsSinceShuffle >= p.deck.length + p.hand.length) {
      p.deck = shuffle(state, p.deck)
      p.drawsSinceShuffle = 0
      log(state, `${side} จั่วครบ deck แล้ว: สับ deck ใหม่`)
    }
    effectOf(state, side, card)?.onDraw?.({ state, self: side, enemy: side === 'p1' ? 'p2' : 'p1', card, pending: null })
  }
  return drawn
}

/** Used / lost cards go to the bottom of the deck (deck never runs out). */
export function toDeckBottom(state: GameState, side: Side, cards: CardInst[]) {
  state.players[side].deck.push(...cards)
}

export function heal(state: GameState, side: Side, n: number) {
  const p = state.players[side]
  p.hp = Math.min(p.maxHp, p.hp + n)
}

export function loseHp(state: GameState, side: Side, n: number) {
  const p = state.players[side]
  p.hp = Math.max(0, p.hp - n)
}

export function log(state: GameState, line: string) {
  state.log.push(`T${state.turn} ${line}`)
}

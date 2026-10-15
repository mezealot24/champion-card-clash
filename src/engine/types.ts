// Pure game types: no React, no Supabase. The engine only reads these.
import type { EffectSpec } from './effects/spec'

export type CardType = 'P' | 'K' | 'S'
export type Action = 'strike' | 'block' | 'charge'
export type Side = 'p1' | 'p2'

/** One card design (one DB row). Copies share the same def. */
export type CardDef = {
  id: string // CLASS-NNN, e.g. BR-001
  type: CardType
  dmg: number
  effectText: string // display only
  effectSpec?: EffectSpec | null // cards.effect_json; wins over code in effects/registry.ts
}

/** One physical card in a game. uid is unique even for copies. */
/**
 * grow = dmg this copy has gained for the rest of the game; growNext = dmg it adds to its next attack only.
 * Both stay on the copy when it goes back to the deck.
 * usedOnce = indexes of this card's "once per game" rules that already fired.
 * enteredWith = cards on the Field (this one included) when this copy last came into play.
 */
export type CardInst = { uid: string; def: CardDef; grow?: number; growNext?: number; usedOnce?: number[]; enteredWith?: number }

/** trueDmg = your hits ignore dmg cuts (only Block stops them) */
/** guardBreak = your blocked hits still deal half dmg (used up by your next Strike) */
export type StatusKind = 'noStrike' | 'noBlock' | 'noCharge' | 'blockPlus' | 'trueDmg' | 'guardBreak'
/** n = size, used by blockPlus (Block stops n more hits; negative = fewer) */
export type Status = { kind: StatusKind; turns: number; n?: number }

export type PlayerState = {
  championId: string
  hp: number
  maxHp: number
  hand: CardInst[] // index 0 = oldest = slot 1 of the Strike chain
  deck: CardInst[] // index 0 = top
  statuses: Status[]
  /** Chosen Style (passive), key "CHAMP:slot" in engine/styles.ts. */
  style?: string
  /** Style bookkeeping (e.g. Second Wind already spent). */
  styleData?: Record<string, number>
  /** Signature combo bookkeeping (e.g. Bruiser Conqueror stacks). */
  comboData?: Record<string, number>
}

export type RulesConfig = {
  handMax: number
  startHand: number
  blockStopsHits: number
  blockStreakDiscard: number
  chargeDraw: number
}

export const DEFAULT_RULES: RulesConfig = {
  handMax: 5,
  startHand: 0, // Q 2026-10-13: start with an empty hand, cards come only from Charge
  blockStopsHits: 2,
  blockStreakDiscard: 3,
  chargeDraw: 1,
}

export type GameState = {
  turn: number
  players: Record<Side, PlayerState>
  blockStreak: number
  winner: Side | 'draw' | null
  rules: RulesConfig
  rngSeed: number
  log: string[] // human-readable, newest last
}

export const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')

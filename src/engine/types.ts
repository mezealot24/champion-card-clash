// Pure game types: no React, no Supabase. The engine only reads these.

export type CardType = 'P' | 'K' | 'S'
export type Action = 'strike' | 'block' | 'charge'
export type Side = 'p1' | 'p2'

/** One card design (one DB row). Copies share the same def. */
export type CardDef = {
  id: string // CLASS-NNN, e.g. BR-001
  type: CardType
  dmg: number
  effectText: string // display only; behaviour lives in effects/registry.ts
}

/** One physical card in a game. uid is unique even for copies. */
export type CardInst = { uid: string; def: CardDef }

export type StatusKind = 'noStrike' | 'noBlock' | 'noCharge'
export type Status = { kind: StatusKind; turns: number }

export type PlayerState = {
  championId: string
  hp: number
  maxHp: number
  hand: CardInst[] // index 0 = oldest = slot 1 of the Strike chain
  deck: CardInst[] // index 0 = top
  statuses: Status[]
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
  startHand: 5,
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

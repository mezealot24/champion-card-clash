import type { Action, CardInst, CardType, GameState, Side } from '../types'

/** One enemy hit a side received: landed = not stopped by Block or Parry. */
export type HitIn = { slot: number; type: CardType; blocked: boolean; landed: boolean }

/** What every effect can see. pending != null means draws wait until the chain ends. */
export type BaseCtx = {
  state: GameState
  self: Side
  enemy: Side
  card: CardInst
  pending: Record<Side, number> | null
  /** Field position (0-based); on draw, the slot the card landed in */
  slot?: number
}

/**
 * Context while a card is inside a Strike chain. Held cards (Before attack / Hold of a side that
 * didn't Strike) get the same shape with an empty chain; slot = their hand position.
 */
export type ChainCtx = BaseCtx & {
  slot: number // 0-based position in the chain (slot 1 = 0)
  chain: CardInst[]
  enemyChain: CardInst[] | null // set only when the enemy also Strikes
  selfAction: Action
  enemyAction: Action
  /** Both hands as they were when actions were revealed. */
  handAtStart: Record<Side, CardInst[]>
  /** Hits each side's Block stopped this turn (filled while the chain resolves; final by Hold time). */
  hitsBlocked: Record<Side, number>
  /** Change to how many hits each side's Block stops this turn (Before attack effects write here). */
  blockNow: Record<Side, number>
  /** Dmg each side takes from hits this turn (known once Before attack is done). */
  hitDmgTaken: Record<Side, number>
  /** Enemy hits each side received this turn (empty during Before action). */
  hitsIn: Record<Side, HitIn[]>
  /** On hit only: count just the enemy hits up to this slot (0-based). */
  hitsUpTo?: number
  /** Dmg bonus per slot of my chain; modify hooks write here. */
  bonus: number[]
  /** Same for the enemy chain (only when the enemy Strikes). */
  enemyBonus: number[] | null
  /** Dmg multiplier per slot (1 = normal, 0.5 = half), applied after bonus, rounded down. */
  mult: number[]
  enemyMult: number[] | null
  /** 1 = that slot of my chain ignores Block (Pierce). */
  pierce: number[]
  /** Hit phase only: was this hit stopped by Block? */
  blocked: boolean
  /** Hit phase only: did this hit land clean (not blocked, dmg > 0)? */
  clean: boolean
}

export type Act<C extends BaseCtx = ChainCtx> = (ctx: C) => void
export type Cond = (ctx: ChainCtx) => boolean

/**
 * Hooks a card can have. All optional.
 * - modify: before any hit, adjust dmg of this / later cards (chain auras)
 * - onHit: right after this card's own hit, mid-chain (only when its side Strikes); blocked / clean are known
 * - onResolve: when this card hits, blocked or not (Q: blocked cards still fire effects, just 0 dmg)
 * - onClean: when this card hits clean (not blocked, dmg > 0)
 * - onBlocked: when this card is stopped by Block
 * - onDraw: when this card is drawn into the hand
 * - onHeld: each turn this card sits in the hand and we don't Strike (slot = hand position, chain is empty)
 * - onHeldBefore: same, but right after actions are revealed (before any hit), so statuses count this turn
 */
export type CardEffect = {
  modify?: Act
  onHit?: Act
  onResolve?: Act
  onClean?: Act
  onBlocked?: Act
  onDraw?: Act<BaseCtx>
  onHeld?: Act
  onHeldBefore?: Act
}

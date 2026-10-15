// Champion Styles (passives). Code registry keyed by "CHAMP:slot" (champion_styles.slot).
// Kept free of state.ts imports so createGame can call setup without an import cycle.
import type { GameState, PlayerState, Side } from './types'

/** What a side went through in this turn's Strike phase. */
export type HitReport = {
  attacked: boolean // the opponent Struck
  hitsTaken: number // hits that landed (not stopped by Block)
  hitsBlocked: number // hits this side's Block stopped
  facing: number // card pairs face to face (opponent's chain vs this side's Field)
}

export type StyleDef = {
  name: string
  /** once, when the game is created */
  setup?: (p: PlayerState) => void
  /** after all hits land, before Every turn (after) and Charge draws */
  afterHits?: (state: GameState, side: Side, r: HitReport) => void
  /** Strike chains only: after Before attack effects, before any hit. bonus = dmg per slot of this side's chain */
  beforeHits?: (state: GameState, side: Side, bonus: number[]) => void
  /** How many leading Field slots a charge break can't throw away (default 0 = oldest card is lost) */
  chargeBreakSafe?: (state: GameState, side: Side) => number
  /** last thing in the turn, before the winner check */
  endTurn?: (state: GameState, side: Side) => void
}

const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const pctHp = (p: PlayerState) => (p.hp * 100) / p.maxHp

export const STYLES: Record<string, StyleDef> = {
  /**
   * Tank · Second Wind: when hit while HP < 60%, heal 4% of missing HP per hit landed this turn.
   * Works only during the first stretch below 60%: once HP climbs back above 60%, it's off for the game.
   */
  'TK:1': {
    name: 'Second Wind',
    afterHits: (state, side, r) => {
      const p = state.players[side]
      if (p.styleData?.spent || r.hitsTaken === 0 || p.hp <= 0 || pctHp(p) >= 60) return
      const n = Math.floor(((p.maxHp - p.hp) * 4 * r.hitsTaken) / 100)
      p.hp = Math.min(p.maxHp, p.hp + n)
      p.styleData = { ...p.styleData, below: 1 }
      say(state, side, `Second Wind: ฮีล ${n} (4% ของ HP ที่หายไป x ${r.hitsTaken} hit)`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.spent) return
      if (pctHp(p) < 60) p.styleData = { ...p.styleData, below: 1 }
      else if (p.styleData?.below && pctHp(p) > 60) {
        p.styleData = { ...p.styleData, spent: 1 }
        say(state, side, 'Second Wind: HP กลับมาเกิน 60% ปิดถาวร')
      }
    },
  },

  /**
   * Tank · Overgrowth: Max HP starts at 160. Each time attacked: +1 per hit taken,
   * +2 per hit blocked, +3 per facing card. Cap 500. Current HP goes up by the same amount (Q: B).
   */
  'TK:2': {
    name: 'Overgrowth',
    setup: (p) => {
      p.maxHp = 160
      p.hp = Math.min(p.hp, p.maxHp)
    },
    afterHits: (state, side, r) => {
      if (!r.attacked) return
      const p = state.players[side]
      const gain = Math.min(500 - p.maxHp, r.hitsTaken + r.hitsBlocked * 2 + r.facing * 3)
      if (gain <= 0) return
      p.maxHp += gain
      if (p.hp > 0) p.hp += gain
      say(state, side, `Overgrowth: Max HP +${gain} → ${p.maxHp} (HP +${gain})`)
    },
  },
}

const below50 = (state: GameState, side: Side) => pctHp(state.players[side]) < 50

Object.assign(STYLES, {
  /** Bruiser · Fury: while HP < 50%, cards in slot 1 and 2 of your Strike chain deal +10 dmg. */
  'BR:1': {
    name: 'Fury',
    beforeHits: (state, side, bonus) => {
      if (!below50(state, side)) return
      for (const i of [0, 1]) if (i < bonus.length) bonus[i] += 10
      say(state, side, `Fury: ช่อง 1–2 +10 dmg`)
    },
  },
  /**
   * Bruiser · Tenacity: while HP < 50%, a charge break can't throw away the cards in slot 1 and 2.
   * The oldest card after them is lost instead; with 2 cards or fewer nothing is lost.
   */
  'BR:2': {
    name: 'Tenacity',
    chargeBreakSafe: (state, side) => (below50(state, side) ? 2 : 0),
  },
} satisfies Record<string, StyleDef>)

export const getStyle = (key?: string | null) => (key ? STYLES[key] : undefined)

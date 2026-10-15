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

/** What this side's Strike chain did this turn. */
export type ChainReport = {
  chainLength: number
  cleanHits: number
  enemyField: number // cards on the opponent's Field when actions were revealed
}

export type StyleDef = {
  name: string
  /** once, when the game is created */
  setup?: (p: PlayerState) => void
  /** extra cards drawn onto the Field when the game starts */
  startDraw?: number
  /** after all hits land, before Every turn (after) and Charge draws */
  afterHits?: (state: GameState, side: Side, r: HitReport) => void
  /**
   * Strike chains only: after Before attack effects, before any hit.
   * bonus = dmg added per slot of this side's chain, mult = dmg multiplier per slot (applied after bonus),
   * crit = add a slot index to show that hit as Critical in the log
   */
  beforeHits?: (state: GameState, side: Side, bonus: number[], mult: number[], crit: Set<number>) => void
  /** Strike chains only: after this side's chain has hit. Returns extra hits it landed (they count as hits taken). */
  afterChain?: (state: GameState, side: Side, r: ChainReport) => number
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
   * Tank · Overgrowth: Max HP starts at 210 (160 + 50, Q 2026-10-15). Each time attacked: +1 per hit taken,
   * +2 per hit blocked, +3 per facing card. Cap 500. Only Max HP grows; current HP does not
   * heal (Q nerf 2026-10-15).
   */
  'TK:2': {
    name: 'Overgrowth',
    setup: (p) => {
      p.maxHp = 210
      p.hp = Math.min(p.hp, p.maxHp)
    },
    afterHits: (state, side, r) => {
      if (!r.attacked) return
      const p = state.players[side]
      const gain = Math.min(500 - p.maxHp, r.hitsTaken + r.hitsBlocked * 2 + r.facing * 3)
      if (gain <= 0) return
      p.maxHp += gain
      say(state, side, `Overgrowth: Max HP +${gain} → ${p.maxHp}`)
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

Object.assign(STYLES, {
  /**
   * Assassin · Sonic Bliz: start the game with 3 cards on the Field (Q buff 2026-10-15).
   * 3+ clean hits in one chain → extra hits 6–10, one per card on the
   * opponent's Field at the start of the turn. Each extra hit deals dmg = cards in your chain (Claude default for "cards in hand").
   */
  'AS:1': {
    name: 'Sonic Bliz',
    startDraw: 3,
    afterChain: (state, side, r) => {
      if (r.cleanHits < 3 || r.enemyField === 0) return 0
      const enemy = side === 'p1' ? 'p2' : 'p1'
      const p = state.players[enemy]
      p.hp = Math.max(0, p.hp - r.enemyField * r.chainLength)
      say(state, side, `Sonic Bliz: Extra Hit ${r.enemyField} ครั้ง x ${r.chainLength} dmg`)
      return r.enemyField
    },
  },
  /** Assassin · Coup de grâce: every 4th attack (counted across turns, blocked ones too) is a Critical: 3x dmg. */
  'AS:2': {
    name: 'Coup de grâce',
    beforeHits: (state, side, _bonus, mult, crit) => {
      const p = state.players[side]
      const before = p.styleData?.attacks ?? 0
      mult.forEach((_, i) => {
        if ((before + i + 1) % 4 === 0) {
          mult[i] *= 3
          crit.add(i)
          say(state, side, `Coup de grâce Critical: ช่อง ${i + 1} (ตีครั้งที่ ${before + i + 1}) dmg x3`)
        }
      })
      p.styleData = { ...p.styleData, attacks: before + mult.length }
    },
  },
} satisfies Record<string, StyleDef>)

export const getStyle = (key?: string | null) => (key ? STYLES[key] : undefined)

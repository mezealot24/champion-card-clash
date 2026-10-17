// Champion Styles (passives). Code registry keyed by "CHAMP:slot" (champion_styles.slot).
// Kept free of state.ts imports so createGame can call setup without an import cycle.
import { CONQUEROR_MAX } from './combos'
import { RED_HP_PCT } from './resources'
import type { Action, CardInst, GameState, PlayerState, Side } from './types'
import { other } from './types'

/** Sonic Bliz Overdrive: dmg added to every chain card per Energy spent (Claude default 2026-10-16). */
export const SONIC_DMG_PER_ENERGY = 2
/** Sonic Bliz Overdrive: fewest cards in the chain that set it off (Q 2026-10-16: 3, was a full Field of 5). */
export const OVERDRIVE_MIN_CHAIN = 3
/** Coup de grâce: enemy HP below this % of Max HP (the red HP bar) → Critical x4 instead of x3. */
export const COUP_RED_HP_PCT = RED_HP_PCT

/**
 * Ignite (Pyromancer, Q rework 2026-10-17): a burning debuff, stacks up to IGNITE_MAX.
 * End of every turn: lose 3 HP + 1% of Max HP per stack. Heals are cut 25% per stack, at most 50% (Claude pick of Q's 50/75).
 * Lasts IGNITE_TURNS turns (3 burns); a new stack resets the timer.
 */
export const IGNITE_MAX = 4
export const IGNITE_TURNS = 3
export const IGNITE_FLAT_PER_STACK = 3
export const IGNITE_HEAL_CUT_PER_STACK = 25
export const IGNITE_HEAL_CUT_MAX = 50
/** Molten Shield: Shield a Block always gets. */
export const MOLTEN_SHIELD = 5

export const igniteStacks = (p: PlayerState) => p.statuses.find((s) => s.kind === 'ignite')?.n ?? 0
/** HP one end-of-turn burn takes. */
export const igniteBurn = (p: PlayerState) => {
  const n = igniteStacks(p)
  return n * IGNITE_FLAT_PER_STACK + Math.floor((p.maxHp * n) / 100)
}
export const healAfterIgnite = (p: PlayerState, n: number) =>
  Math.floor((n * (100 - Math.min(IGNITE_HEAL_CUT_MAX, IGNITE_HEAL_CUT_PER_STACK * igniteStacks(p)))) / 100)

/** Add n Ignite stacks to a side (capped) and reset its timer. Returns the stacks it has now. */
export function addIgnite(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  const cur = p.statuses.find((s) => s.kind === 'ignite')
  // n = 0 only refreshes the timer of a burn that's already on (Sear Flesh)
  if (!cur && n <= 0) return 0
  const stacks = Math.min(IGNITE_MAX, (cur?.n ?? 0) + n)
  if (cur) {
    cur.n = stacks
    cur.turns = IGNITE_TURNS
  } else p.statuses.push({ kind: 'ignite', turns: IGNITE_TURNS, n: stacks })
  return stacks
}

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
  paidSkillClean: number // Skill cards in the chain whose cost was paid and that hit clean
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
  beforeHits?: (state: GameState, side: Side, bonus: number[], mult: number[], crit: Set<number>, chain?: CardInst[]) => void
  /** Strike chains only: after this side's chain has hit. Returns extra hits it landed (they count as hits taken). */
  afterChain?: (state: GameState, side: Side, r: ChainReport) => number
  /** Strike chains only: right after Before action combos, before Conqueror and any hit (e.g. Juggernaut stacks) */
  strikeStart?: (state: GameState, side: Side, chain: CardInst[]) => void
  /** How many leading Field slots a charge break can't throw away (default 0 = oldest card is lost) */
  chargeBreakSafe?: (state: GameState, side: Side) => number
  /** Dual Strike (both sides Strike this turn): at the end of the turn, after resources fill, draw n and/or fill the bar to its cap */
  dualStrike?: { draw?: number; fillRes?: boolean }
  /** extra cards a Charge that isn't broken draws */
  chargeDraw?: number
  /** right after actions are revealed, before statuses are read or tick (e.g. Molten Shield on Block) */
  actionStart?: (state: GameState, side: Side, action: Action) => void
  /** last thing in the turn, before the winner check (action = what this side played) */
  endTurn?: (state: GameState, side: Side, action: Action) => void
}

const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const pctHp = (p: PlayerState) => (p.hp * 100) / p.maxHp
/** Overgrowth: +1 dmg per 20 Max HP grown */
export const overgrowthDmg = (p: PlayerState) => Math.floor((p.styleData?.grown ?? 0) / 20)

export const STYLES: Record<string, StyleDef> = {
  /**
   * Tank · Second Wind: when hit while HP is red (below RED_HP_PCT = 30%), heal 4% of missing HP per hit landed this turn.
   * Works only during the first stretch in the red: once HP is back in the green (30%+), it's off for the game (Q nerf 2026-10-16, was 60%).
   */
  'TK:1': {
    name: 'Second Wind',
    afterHits: (state, side, r) => {
      const p = state.players[side]
      if (p.styleData?.spent || r.hitsTaken === 0 || p.hp <= 0 || pctHp(p) >= RED_HP_PCT) return
      const n = healAfterIgnite(p, Math.floor(((p.maxHp - p.hp) * 4 * r.hitsTaken) / 100))
      const before = p.hp
      p.hp = Math.min(p.maxHp, p.hp + n)
      if (p.hp !== before) (state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
      p.styleData = { ...p.styleData, below: 1 }
      say(state, side, `Second Wind: ฮีล ${n} (4% ของ HP ที่หายไป x ${r.hitsTaken} hit)`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.spent) return
      if (pctHp(p) < RED_HP_PCT) p.styleData = { ...p.styleData, below: 1 }
      else if (p.styleData?.below) {
        p.styleData = { ...p.styleData, spent: 1 }
        say(state, side, `Second Wind: HP กลับมาหลอดเขียว (${RED_HP_PCT}%+) ปิดถาวร`)
      }
    },
  },

  /**
   * Tank · Overgrowth: starts with the Tank's normal HP / Max HP, same as Second Wind (Q 2026-10-16; was Max HP 210). Each time attacked: +1 per hit taken,
   * +2 per hit blocked, +3 per facing card. Cap 500. Only Max HP grows; current HP does not
   * heal (Q nerf 2026-10-15).
   * Q buff 2026-10-16: every 20 Max HP grown this way = +1 dmg on every card you strike with (Max HP lost later doesn't undo it).
   */
  'TK:2': {
    name: 'Overgrowth',
    afterHits: (state, side, r) => {
      if (!r.attacked) return
      const p = state.players[side]
      const gain = Math.min(500 - p.maxHp, r.hitsTaken + r.hitsBlocked * 2 + r.facing * 3)
      if (gain <= 0) return
      p.maxHp += gain
      p.styleData = { ...p.styleData, grown: (p.styleData?.grown ?? 0) + gain }
      say(state, side, `Overgrowth: Max HP +${gain} → ${p.maxHp}`)
    },
    beforeHits: (state, side, bonus) => {
      const n = overgrowthDmg(state.players[side])
      if (!n) return
      for (let i = 0; i < bonus.length; i++) bonus[i] += n
      say(state, side, `Overgrowth: ทุกใบ +${n} dmg`)
    },
  },
}

/** Juggernaut: how many turns Tenacity lasts after the Conqueror stacks fill up. */
export const TENACITY_TURNS = 2

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
   * Bruiser · Juggernaut (Q 2026-10-16, Conqueror + Tenacity merged; name by Claude).
   * Every Strike: +1 Conqueror stack per card in the chain, before it hits (max 6; see applyConqueror in combos.ts).
   * When the stacks reach max: Tenacity for the next 2 turns (a charge break can't throw away the slot 1 card).
   * Every turn you Block: −1 stack. Charge keeps the stacks (no gain, no loss; Q 2026-10-16 22:03Z).
   */
  'BR:2': {
    name: 'Juggernaut',
    strikeStart: (state, side, chain) => {
      const p = state.players[side]
      const was = p.comboData?.conqueror ?? 0
      const n = Math.min(CONQUEROR_MAX, was + chain.length)
      if (n === was) return
      p.comboData = { ...p.comboData, conqueror: n }
      say(state, side, `Juggernaut: Conqueror ${n}/${CONQUEROR_MAX}${n === CONQUEROR_MAX ? ' (Omnivamp)' : ''}`)
      if (n === CONQUEROR_MAX) {
        p.styleData = { ...p.styleData, tenacityFrom: state.turn }
        say(state, side, `Juggernaut: Tenacity ${TENACITY_TURNS} เทิร์น (ช่อง 1 ไม่โดนทิ้งจาก charge break)`)
      }
    },
    chargeBreakSafe: (state, side) => {
      const from = state.players[side].styleData?.tenacityFrom
      return from != null && state.turn > from && state.turn <= from + TENACITY_TURNS ? 1 : 0
    },
    endTurn: (state, side, action) => {
      const p = state.players[side]
      const n = p.comboData?.conqueror ?? 0
      if (action !== 'block' || !n) return
      p.comboData = { ...p.comboData, conqueror: n - 1 }
      say(state, side, `Juggernaut: Block, Conqueror ${n - 1}/${CONQUEROR_MAX}`)
    },
  },
} satisfies Record<string, StyleDef>)

Object.assign(STYLES, {
  /**
   * Assassin · Sonic Bliz: start the game with 3 cards on the Field (Q buff 2026-10-15).
   * Acceleration (Q 2026-10-16, replaced Extra Hits): when you and the opponent both Strike, Energy refills and you draw 2.
   */
  'AS:1': {
    name: 'Sonic Bliz',
    startDraw: 3,
    /**
     * Overdrive (Q 2026-10-16): Strike with 3+ cards (was a full Field of 5) and no S card in the chain → all Energy
     * left is spent, every card in the chain gets +SONIC_DMG_PER_ENERGY dmg per Energy spent (Claude default).
     * A Style, so Silence doesn't stop it.
     */
    beforeHits: (state, side, bonus, _mult, _crit, chain) => {
      const p = state.players[side]
      const energy = p.res ?? 0
      if (!state.rules.resources || energy <= 0 || bonus.length < OVERDRIVE_MIN_CHAIN) return
      if (chain?.some((c) => c.def.type === 'S')) return
      const add = energy * SONIC_DMG_PER_ENERGY
      for (let i = 0; i < bonus.length; i++) bonus[i] += add
      p.res = 0
      say(state, side, `Sonic Bliz Overdrive: ใช้ Energy ${energy} ทั้งหมด → ทุกใบในสาย +${add} dmg`)
    },
    // Acceleration (Q 2026-10-16, replaces Extra Hits): Strike meets Strike → Energy full + draw 2 at the end of the turn
    dualStrike: { draw: 2, fillRes: true },
  },
  /** Assassin · Coup de grâce: every 4th attack (counted across turns, blocked ones too) is a Critical: 3x dmg,
   *  4x while the enemy's HP is in the red (below 30% of Max HP at the start of the Strike, like the HP bar).
   *  A blocked Critical still deals 50% (engine dealtOf). */
  'AS:2': {
    name: 'Coup de grâce',
    beforeHits: (state, side, _bonus, mult, crit) => {
      const p = state.players[side]
      const enemy = state.players[side === 'p1' ? 'p2' : 'p1']
      const x = enemy.hp * 100 < enemy.maxHp * COUP_RED_HP_PCT ? 4 : 3
      const before = p.styleData?.attacks ?? 0
      mult.forEach((_, i) => {
        if ((before + i + 1) % 4 === 0) {
          mult[i] *= x
          crit.add(i)
          say(state, side, `Coup de grâce Critical: ช่อง ${i + 1} (ตีครั้งที่ ${before + i + 1}) dmg x${x}`)
        }
      })
      p.styleData = { ...p.styleData, attacks: before + mult.length }
    },
  },
} satisfies Record<string, StyleDef>)

Object.assign(STYLES, {
  /**
   * Mage · Pyromancer (Q 2026-10-17, replaces Mana Flow; reworked the same day so it costs no extra Mana).
   * Touch of Flame: every Skill card you paid for that hits clean gives the opponent 1 Ignite (after your chain).
   * Molten Shield: every Block gets Shield 5 this turn; with 1+ Mana (not spent), each hit your Block stops
   * gives the attacker 1 Ignite.
   */
  'MG:1': {
    name: 'Pyromancer',
    afterChain: (state, side, r) => {
      if (!r.paidSkillClean) return 0
      const n = addIgnite(state, other(side), r.paidSkillClean)
      say(state, side, `Touch of Flame: Skill ที่จ่ายแล้วเข้า ${r.paidSkillClean} ใบ → ศัตรูติด 🔥 Ignite (${n} stack)`)
      return 0
    },
    actionStart: (state, side, action) => {
      const p = state.players[side]
      if (action !== 'block') return
      // turns 1: an old-shield tick at the end of this turn removes it
      p.statuses.push({ kind: 'shield', turns: 1, n: MOLTEN_SHIELD })
      const hot = !state.rules.resources || (p.res ?? 0) >= 1
      p.styleData = { ...p.styleData, molten: hot ? 1 : 0 }
      say(state, side, `Molten Shield: Shield ${MOLTEN_SHIELD} เทิร์นนี้${hot ? ' + hit ที่ Block ได้จุด Ignite' : ''}`)
    },
    afterHits: (state, side, r) => {
      const p = state.players[side]
      if (!p.styleData?.molten || !r.hitsBlocked) return
      const n = addIgnite(state, other(side), r.hitsBlocked)
      say(state, side, `Molten Shield: Block ได้ ${r.hitsBlocked} hit → ศัตรูติด 🔥 Ignite (${n} stack)`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.molten) p.styleData = { ...p.styleData, molten: 0 }
    },
  },
  /**
   * Mage · Mana Barrier: start the game with Shield 30 (lasts until used up).
   * Each turn you play Block, your Shield is topped up to 8 if lower; that top-up lasts 2 turns.
   */
  'MG:2': {
    name: 'Mana Barrier',
    setup: (p) => {
      p.statuses.push({ kind: 'shield', turns: 9999, n: 30 })
    },
    endTurn: (state, side, action) => {
      if (action !== 'block') return
      const p = state.players[side]
      const now = p.statuses.filter((s) => s.kind === 'shield').reduce((t, s) => t + (s.n ?? 0), 0)
      if (now >= 8) return
      p.statuses = p.statuses.filter((s) => s.kind !== 'shield')
      p.statuses.push({ kind: 'shield', turns: 2, n: 8 })
      say(state, side, 'Mana Barrier: Shield 8')
    },
  },
} satisfies Record<string, StyleDef>)

export const getStyle = (key?: string | null) => (key ? STYLES[key] : undefined)

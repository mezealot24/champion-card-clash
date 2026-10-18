// Champion Styles (passives). Code registry keyed by "CHAMP:slot" (champion_styles.slot).
// Kept free of state.ts imports so createGame can call setup without an import cycle.
import { CONQUEROR_MAX, freeze } from './combos'
export { freeze }
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
 * End of every turn: lose IGNITE_FLAT_PER_STACK HP + 1% of Max HP per stack. Heals are cut 25% per stack, at most 50% (Claude pick of Q's 50/75).
 * Lasts IGNITE_TURNS turns (3 burns); a new stack resets the timer.
 */
export const IGNITE_MAX = 4
export const IGNITE_TURNS = 3
export const IGNITE_FLAT_PER_STACK = 2 // Q asked 3; sim 3 = 65% win, 2 = 47%, 1 = 39% (Claude pick)
export const IGNITE_HEAL_CUT_PER_STACK = 25
export const IGNITE_HEAL_CUT_MAX = 50
// Cryomancer (Mage Style 2, Q 2026-10-18 from a Gemini draft; replaces Frostbinder): numbers are Q's (picked A)
export const CHILL_MAX = 4 // reaching this many stacks freezes
export const CHILL_TURNS = 3
export const CHILL_DMG_CUT_PER_STACK = 10
/** Frozen Tomb (Q 2026-10-18, replaces Frost Barrier): once a game, a hit that leaves the Cryomancer below this % of Max HP
 *  (or would kill them: they stay on 1 HP) seals them in ice: Frost Armor's Shield comes back, next turn they can only Block. */
export const TOMB_HP_PCT = RED_HP_PCT // Q 2026-10-18: 30% (the red HP bar), was 40
/** Frozen Tomb heal at the end of the Block-only turn: TOMB_HEAL + TOMB_HEAL_PER_MANA × Mana (all of it is spent) */
export const TOMB_HEAL = 10
export const TOMB_HEAL_PER_MANA = 5 // Q 2026-10-18 nerf, was 10 (sim 68%)
/** Deep Freeze: Mana a Strike with a Skill card in it spends for 1 Chill */
export const DEEP_FREEZE_MANA = 1
/** Frost Armor (Q 2026-10-18, Frostbinder's start Shield back): Shield the game starts with; every hit it soaks gives the attacker 1 Chill */
export const FROST_ARMOR_SHIELD = 40
/** Shatter: a side frozen by Chill loses this % of its Max HP (Q 2026-10-18; sim 240 games: none 8%, 15% = 59% win) */
export const SHATTER_PCT = 15
export const chillStacks = (p: PlayerState) => p.statuses.find((s) => s.kind === 'chill')?.n ?? 0
/** % the chilled side's hits lose */
export const chillCut = (p: PlayerState) => chillStacks(p) * CHILL_DMG_CUT_PER_STACK

/** Add n Chill stacks to a side and reset its timer. Reaching CHILL_MAX freezes it and Shatter takes SHATTER_PCT of its Max HP. Returns the stacks it has now (0 after a freeze). */
export function addChill(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  const cur = p.statuses.find((s) => s.kind === 'chill')
  if (!cur && n <= 0) return 0
  const stacks = Math.min(CHILL_MAX, (cur?.n ?? 0) + n)
  p.statuses = p.statuses.filter((s) => s.kind !== 'chill')
  if (stacks >= CHILL_MAX) {
    const lost = Math.floor((p.maxHp * SHATTER_PCT) / 100)
    p.hp = Math.max(0, p.hp - lost)
    STYLES[p.style ?? '']?.onHpLoss?.(state, side)
    freeze(state, side, `Chill ครบ ${CHILL_MAX}, Shatter เสีย ${lost} HP`)
    return 0
  }
  p.statuses.push({ kind: 'chill', turns: CHILL_TURNS, n: stacks })
  return stacks
}

/** Molten Shield: a Block spends up to MOLTEN_MAX_MANA Mana for Shield MOLTEN_SHIELD_PER_MANA each. */
export const MOLTEN_MAX_MANA = 3
export const MOLTEN_SHIELD_PER_MANA = 5

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
  shieldHits: number // hits a Shield on this side soaked dmg from
  facing: number // card pairs face to face (opponent's chain vs this side's Field)
}

/** What this side's Strike chain did this turn. */
export type ChainReport = {
  chainLength: number
  cleanHits: number
  enemyField: number // cards on the opponent's Field when actions were revealed
  paidSkillClean: number // Skill cards in the chain whose cost was paid and that hit clean
  skills: number // Skill cards in the chain
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
  /** right after this side lost HP from anything (hits, effects, burns); may change p.hp (e.g. Frozen Tomb keeps 1 HP) */
  onHpLoss?: (state: GameState, side: Side) => void
}

const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const pctHp = (p: PlayerState) => (p.hp * 100) / p.maxHp
/** state.heal without the state.ts import: Ignite cuts it, capped at Max HP, nothing for a side at 0 HP. Returns HP gained. */
const heal = (state: GameState, side: Side, n: number) => {
  const p = state.players[side]
  if (p.hp <= 0) return 0
  const before = p.hp
  p.hp = Math.min(p.maxHp, p.hp + healAfterIgnite(p, n))
  if (p.hp !== before) (state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
  return p.hp - before
}
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
      const add = overdriveAdd(state, side, chain ?? p.hand)
      if (!add) return
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
   * Molten Shield (first version, Q asked it back): a Block with Mana spends up to 3 of it for Shield 5 per Mana
   * this turn, and each hit that Block stops gives the attacker 1 Ignite. No Mana, no Molten Shield.
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
      // Molten Shield v1 (Q asked it back 2026-10-17): Block spends up to 3 Mana, Shield 5 per Mana
      if (action !== 'block' || !state.rules.resources || (p.res ?? 0) <= 0) return
      const spent = Math.min(MOLTEN_MAX_MANA, p.res ?? 0)
      p.res = (p.res ?? 0) - spent
      // turns 1: an old-shield tick at the end of this turn removes it
      p.statuses.push({ kind: 'shield', turns: 1, n: spent * MOLTEN_SHIELD_PER_MANA })
      p.styleData = { ...p.styleData, molten: 1 }
      say(state, side, `Molten Shield: ใช้ Mana ${spent} → Shield ${spent * MOLTEN_SHIELD_PER_MANA} เทิร์นนี้ + hit ที่ Block ได้จุด Ignite`)
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
   * Mage · Cryomancer (Q 2026-10-18, from a Gemini draft; replaces Frostbinder).
   * Frost Armor: start the game with Shield 40; every hit a Shield soaks gives the attacker 1 Chill.
   * Deep Freeze: a Strike with any Skill card in it spends 1 more Mana (after the chain) to give the opponent 1 Chill.
   * Frozen Tomb (Q 2026-10-18, replaces Frost Barrier), once a game: HP loss that leaves you below 30% Max HP (the red bar), or would
   * kill you (you stay on 1 HP, and can't drop below 1 for the rest of that turn), brings Frost Armor's Shield 40 back.
   * Next turn you can only Block; at its end heal 10 + 5 per Mana, spending all Mana. The turn after, the Shield
   * left melts: half of it comes back as HP. (Turn order and the Mana spend are Claude defaults.)
   * Chill: each stack makes that side's hits deal 10% less (3 turns, refreshed). At 4 stacks it is Frozen:
   * Chill clears, Shatter takes 15% of its Max HP and it can't Strike next turn (Absolute Zero freezes without Shatter).
   * Arcane Sub-Zero (card) leaves a subZero status: the next Strike's clean hits each give 1 Chill.
   */
  'MG:2': {
    name: 'Cryomancer',
    setup: (p) => {
      p.statuses.push({ kind: 'shield', turns: 9999, n: FROST_ARMOR_SHIELD })
    },
    actionStart: (state, side, action) => {
      const p = state.players[side]
      // subZero is read here, before statuses tick (it was put on last turn)
      if (action === 'strike' && p.statuses.some((s) => s.kind === 'subZero')) p.styleData = { ...p.styleData, subZero: 1 }
    },
    afterChain: (state, side, r) => {
      const p = state.players[side]
      if (p.styleData?.subZero && r.cleanHits) {
        const n = addChill(state, other(side), r.cleanHits)
        say(state, side, `Arcane Sub-Zero: เข้า clean ${r.cleanHits} hit → ศัตรูติด ❄ Chill${n ? ` (${n} stack)` : ''}`)
      }
      if (r.skills && state.rules.resources && (p.res ?? 0) >= DEEP_FREEZE_MANA) {
        p.res = (p.res ?? 0) - DEEP_FREEZE_MANA
        const n = addChill(state, other(side), 1)
        say(state, side, `Deep Freeze: ใช้ Mana ${DEEP_FREEZE_MANA} → ศัตรูติด ❄ Chill${n ? ` (${n} stack)` : ''}`)
      }
      return 0
    },
    afterHits: (state, side, r) => {
      if (!r.shieldHits) return
      const n = addChill(state, other(side), r.shieldHits)
      say(state, side, `Frost Armor: Shield รับ ${r.shieldHits} hit → ศัตรูติด ❄ Chill${n ? ` (${n} stack)` : ''}`)
    },
    onHpLoss: (state, side) => {
      const p = state.players[side]
      const at = p.styleData?.tombAt
      if (at !== undefined) {
        // sealed this turn: the rest of the turn's dmg can't finish you
        if (at === state.turn && p.hp <= 0) p.hp = 1
        return
      }
      if (p.hp > 0 && pctHp(p) >= TOMB_HP_PCT) return
      const saved = p.hp <= 0
      if (saved) p.hp = 1
      p.styleData = { ...p.styleData, tombAt: state.turn }
      p.statuses = p.statuses.filter((s) => s.kind !== 'shield')
      p.statuses.push({ kind: 'shield', turns: 9999, n: FROST_ARMOR_SHIELD })
      // read by next turn's legal actions, gone after it (statuses tick at the start of a turn)
      p.statuses.push({ kind: 'noStrike', turns: 1 }, { kind: 'noCharge', turns: 1 }, { kind: 'frozenTomb', turns: 1 })
      say(state, side, `🧊 Frozen Tomb${saved ? ' (กันตาย เหลือ 1 HP)' : ''}: Frost Armor Shield ${FROST_ARMOR_SHIELD} กลับมา เทิร์นหน้า Block ได้อย่างเดียว`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.subZero) p.styleData = { ...p.styleData, subZero: 0 }
      const at = p.styleData?.tombAt
      if (at === undefined || p.hp <= 0) return
      if (state.turn === at + 1) {
        const mana = state.rules.resources ? (p.res ?? 0) : 0
        if (state.rules.resources) p.res = 0
        const got = heal(state, side, TOMB_HEAL + TOMB_HEAL_PER_MANA * mana)
        say(state, side, `🧊 Frozen Tomb: ใช้ Mana ${mana} ฟื้น ${got} HP`)
      } else if (state.turn === at + 2) {
        const left = p.statuses.filter((s) => s.kind === 'shield').reduce((t, s) => t + (s.n ?? 0), 0)
        p.statuses = p.statuses.filter((s) => s.kind !== 'shield')
        const got = heal(state, side, Math.floor(left / 2))
        say(state, side, `🧊 Frozen Tomb ละลาย: Shield ที่เหลือ ${left} → ฟื้น ${got} HP`)
      }
    },
  },
} satisfies Record<string, StyleDef>)

/**
 * Sonic Bliz Overdrive dmg each card would get if `side` Struck right now with its whole Field (0 = no Overdrive).
 * Shared by the Style, the AI's look-ahead score and the "Overdrive +N" chip on the battle HUD.
 */
export function overdriveAdd(state: GameState, side: Side, chain: CardInst[] = state.players[side].hand): number {
  const p = state.players[side]
  if (p.style !== 'AS:1' || !state.rules.resources || (p.res ?? 0) <= 0) return 0
  if (chain.length < OVERDRIVE_MIN_CHAIN || chain.some((c) => c.def.type === 'S')) return 0
  return (p.res ?? 0) * SONIC_DMG_PER_ENERGY
}

export const getStyle = (key?: string | null) => (key ? STYLES[key] : undefined)

// Champion Styles (passives). Code registry keyed by "CHAMP:slot" (champion_styles.slot).
// Kept free of state.ts imports so createGame can call setup without an import cycle.
import { freeze } from './combos'
export { freeze }
import { tuningOf, type Tuning } from './tuning'
import type { Action, CardInst, GameState, PlayerState, Side } from './types'
import { other } from './types'

// Every number below comes from the game's tuning (engine/tuning.ts, Admin can change it): t = tuningOf(state).

/*
 * Ignite (Pyromancer, Q rework 2026-10-17): a burning debuff, stacks up to igniteMax.
 * End of every turn: lose igniteFlat HP + ignitePctMaxHp% of Max HP per stack. Heals are cut healCutPerStack% per stack, at most healCutMax%. Q 2026-10-25: 0.5% Max HP and 10% heal cut per stack (was 1.5 / 25).
 * Lasts igniteTurns turns (3 burns); a new stack resets the timer. (Q asked igniteFlat 3; sim 3 = 65% win, 2 = 47%, 1 = 39%: Claude pick 2.)
 *
 * Cryomancer (Mage Style 2, Q 2026-10-18 from a Gemini draft; replaces Frostbinder): numbers are Q's (picked A).
 * Frozen Tomb line = the red HP bar 30% (Q 2026-10-18, was 40); heal 10 + 5 per Mana (Q nerf, was 10 per Mana: sim 68%).
 * Shatter 15% (sim 240 games: none 8%, 15% = 59% win).
 */
export const chillStacks = (p: PlayerState) => p.statuses.find((s) => s.kind === 'chill')?.n ?? 0
/** % the chilled side's hits lose */
export const chillCut = (p: PlayerState, t: Tuning) => chillStacks(p) * t['MG:2'].chillDmgCut

/** Add n Chill stacks to a side and reset its timer. Reaching chillMax freezes it and Shatter takes shatterPct of its Max HP. Returns the stacks it has now (0 after a freeze). */
export function addChill(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  // the numbers of whoever applies it (the other side)
  const t = tuningOf(state, other(side))['MG:2']
  const cur = p.statuses.find((s) => s.kind === 'chill')
  if (!cur && n <= 0) return 0
  const stacks = Math.min(t.chillMax, (cur?.n ?? 0) + n)
  p.statuses = p.statuses.filter((s) => s.kind !== 'chill')
  if (stacks >= t.chillMax && !t.chillNoFreeze) {
    const lost = Math.floor((p.maxHp * t.shatterPct) / 100)
    p.hp = Math.max(0, p.hp - lost)
    for (const h of hooksOf(p)) h.onHpLoss?.(state, side)
    freeze(state, side, `${t.chillMax} Chill, Shatter takes ${lost} HP`)
    return 0
  }
  p.statuses.push({ kind: 'chill', turns: t.chillTurns, n: stacks })
  return stacks
}

export const igniteStacks = (p: PlayerState) => p.statuses.find((s) => s.kind === 'ignite')?.n ?? 0
/** HP one end-of-turn burn takes. */
export const igniteBurn = (p: PlayerState, t: Tuning) => {
  const n = igniteStacks(p)
  const f = t['MG:1']
  return n * f.igniteFlat + Math.floor((p.maxHp * n * f.ignitePctMaxHp) / 100)
}
export const healAfterIgnite = (p: PlayerState, n: number, t: Tuning) =>
  Math.floor((n * (100 - Math.min(t['MG:1'].healCutMax, t['MG:1'].healCutPerStack * igniteStacks(p)))) / 100)

/** Add n Ignite stacks to a side (capped) and reset its timer. Returns the stacks it has now. */
export function addIgnite(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  const t = tuningOf(state, other(side))['MG:1']
  const cur = p.statuses.find((s) => s.kind === 'ignite')
  // n = 0 only refreshes the timer of a burn that's already on (Sear Flesh)
  if (!cur && n <= 0) return 0
  const stacks = Math.min(t.igniteMax, (cur?.n ?? 0) + n)
  if (cur) {
    cur.n = stacks
    cur.turns = t.igniteTurns
  } else p.statuses.push({ kind: 'ignite', turns: t.igniteTurns, n: stacks })
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
  paidSkills: number // Skill cards in the chain whose cost was paid, hit clean or Blocked (⟡ Infuse)
  skills: number // Skill cards in the chain
}

export type StyleDef = {
  name: string
  /** once, when the game is created */
  setup?: (p: PlayerState, t: Tuning) => void
  /** extra cards drawn onto the Field when the game starts */
  startDraw?: (t: Tuning) => number
  /** after all hits land, before Every turn (after) and Charge draws */
  afterHits?: (state: GameState, side: Side, r: HitReport) => void
  /**
   * Strike chains only: after Before attack effects, before any hit.
   * bonus = dmg added per slot of this side's chain, mult = dmg multiplier per slot (applied after bonus),
   * crit = add a slot index to show that hit as Critical in the log
   */
  beforeHits?: (state: GameState, side: Side, bonus: number[], mult: number[], crit: Set<number>, chain?: CardInst[], pierce?: number[]) => void
  /** Strike chains only: after this side's chain has hit. Returns extra hits it landed (they count as hits taken). */
  afterChain?: (state: GameState, side: Side, r: ChainReport) => number
  /** Strike chains only: right after Before action combos, before Momentum and any hit (e.g. Juggernaut stacks) */
  strikeStart?: (state: GameState, side: Side, chain: CardInst[]) => void
  /** How many leading Field slots a charge break can't throw away (default 0 = oldest card is lost) */
  chargeBreakSafe?: (state: GameState, side: Side) => number
  /** Dual Strike (both sides Strike this turn): at the end of the turn, after resources fill, draw n and/or fill the bar to its cap */
  dualStrike?: { draw?: (t: Tuning) => number; fillRes?: boolean }
  /** extra cards a Charge that isn't broken draws */
  chargeDraw?: number
  /** right after actions are revealed, before statuses are read or tick (e.g. Molten Shield on Block) */
  actionStart?: (state: GameState, side: Side, action: Action, enemyAction?: Action) => void
  /** last thing in the turn, before the winner check (action = what this side played) */
  endTurn?: (state: GameState, side: Side, action: Action, enemyAction?: Action) => void
  /** right after this side lost HP from anything (hits, effects, burns); may change p.hp (e.g. Frozen Tomb keeps 1 HP) */
  onHpLoss?: (state: GameState, side: Side) => void
  /** ⟡ Infuse: give targetSide n stacks of this Style's element (Pyromancer Ignite, Cryomancer Chill). Returns the stacks it has now. */
  infuse?: (state: GameState, targetSide: Side, n: number) => number
  // ---- used by loadout pieces (engine/loadout.ts), which share this shape ----
  /** extra hits this side's Block stops this turn (negative = fewer) */
  blockBonus?: (state: GameState, side: Side) => number
  /** Omnivamp % this side gets on top of others */
  lifesteal?: (state: GameState, side: Side) => number
  /** dmg taken off every hit that gets past this side's Block */
  hitCut?: (state: GameState, side: Side) => number
  /** Cost: every hit this side's Block stops after the first still deals this % of its dmg */
  blockLeakPct?: (state: GameState, side: Side) => number
  /** extra cards a Charge that isn't broken draws, decided per turn */
  extraChargeDraw?: (state: GameState, side: Side) => number
  /** Energy Surge switches on at this much less than a full bar (Wraith Form) */
  surgeLess?: (state: GameState, side: Side) => number
  /** Acceleration (dualStrike) draws but doesn't fill the bar (Afterburner's Cost) */
  noDualFill?: boolean
  /** Acceleration also fires when this side Strikes into a Charge (Mach Speed) */
  dualOnCharge?: boolean
  /** this side's Cut effects Cut n more cards (still within CUT_CAP a turn) */
  cutMore?: (state: GameState, side: Side) => number
}

/** A Style or loadout piece that acts in the game: same hooks. Loadout pieces register here (engine/loadout.ts). */
export const PERK_HOOKS: Record<string, StyleDef> = {}

/** Everything that hooks into a side's turn: its Style, then its loadout pieces in order. */
export function hooksOf(p: PlayerState): StyleDef[] {
  const out: StyleDef[] = []
  const style = p.style ? STYLES[p.style] : undefined
  if (style) out.push(style)
  for (const k of p.perks ?? []) if (PERK_HOOKS[k]) out.push(PERK_HOOKS[k])
  return out
}

const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const pctHp = (p: PlayerState) => (p.hp * 100) / p.maxHp
/** state.heal without the state.ts import: Ignite cuts it, capped at Max HP, nothing for a side at 0 HP. Returns HP gained. */
export const styleHeal = (state: GameState, side: Side, n: number) => {
  const p = state.players[side]
  if (p.hp <= 0) return 0
  const before = p.hp
  p.hp = Math.min(p.maxHp, p.hp + healAfterIgnite(p, n, tuningOf(state, other(side))))
  if (p.hp !== before) (state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
  return p.hp - before
}
/**
 * ⟡ Infuse (Mage, Q 2026-10-19): after the chain, every paid Skill card in it, hit clean or Blocked,
 * gives the enemy MG.infusePerS stacks of the Style's element (its infuse hook). Unpaid S cards give none.
 */
function infuseChain(state: GameState, side: Side, r: ChainReport, element: string) {
  const n = r.paidSkills * tuningOf(state, side).MG.infusePerS
  const infuse = STYLES[state.players[side].style ?? '']?.infuse
  if (n <= 0 || !infuse) return
  const k = infuse(state, other(side), n)
  say(state, side, `⟡ Infuse: ${r.paidSkills} paid Skill card${r.paidSkills === 1 ? '' : 's'} → enemy gets ${element}${k ? ` (${k} stacks)` : ''}`)
}

/** Titan Bloom: +1 dmg per hpPerDmg (20) Max HP grown */
export const overgrowthDmg = (p: PlayerState, t: Tuning) => Math.floor((p.styleData?.grown ?? 0) / t['TK:2'].hpPerDmg)

const DEBUFF_KINDS = ['ignite', 'chill', 'frozen', 'silence', 'skillSilence', 'noBlock', 'noCharge', 'noStrike', 'vulnerable', 'deathMark', 'venom']
/** Is this status a debuff (harmful, put on by the enemy)? Block − counts; Block + doesn't. */
export const isDebuff = (s: PlayerState['statuses'][number]) => DEBUFF_KINDS.includes(s.kind) || (s.kind === 'blockPlus' && (s.n ?? 0) < 0)

/** Debuff stacks on a side: Ignite / Chill / Venom count each stack, every other harmful status counts 1 (Frozen covers its noStrike). */
export function debuffStacks(p: PlayerState): number {
  let n = 0
  for (const s of p.statuses) {
    if (!isDebuff(s)) continue
    if (s.kind === 'ignite' || s.kind === 'chill' || s.kind === 'venom') n += s.n ?? 0
    else if (s.kind !== 'noStrike' || !p.statuses.some((x) => x.kind === 'frozen')) n++
  }
  return n
}

export const STYLES: Record<string, StyleDef> = {
  /**
   * Tank · Lifeline: when hit while HP is red (below hpPct = 30%), heal healPctPerHit = 4% of missing HP per hit landed this turn.
   * Works only during the first stretch in the red: once HP is back in the green (30%+), it's off for the game (Q nerf 2026-10-16, was 60%).
   */
  'TK:1': {
    name: 'Lifeline',
    afterHits: (state, side, r) => {
      const p = state.players[side]
      const f = tuningOf(state, side)['TK:1']
      if (p.styleData?.spent || r.hitsTaken === 0 || p.hp <= 0 || pctHp(p) >= f.hpPct) return
      const n = healAfterIgnite(p, Math.floor(((p.maxHp - p.hp) * f.healPctPerHit * r.hitsTaken) / 100), tuningOf(state, other(side)))
      const before = p.hp
      p.hp = Math.min(p.maxHp, p.hp + n)
      if (p.hp !== before) (state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
      p.styleData = { ...p.styleData, below: 1 }
      say(state, side, `Second Wind: heal ${n} (${f.healPctPerHit}% of missing HP x ${r.hitsTaken} hits)`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.spent) return
      const line = tuningOf(state, side)['TK:1'].hpPct
      if (pctHp(p) < line) p.styleData = { ...p.styleData, below: 1 }
      else if (p.styleData?.below) {
        p.styleData = { ...p.styleData, spent: 1 }
        say(state, side, `Second Wind: HP back above ${line}%, off for good`)
      }
    },
  },

  /**
   * Tank · Titan Bloom: starts with the Tank's normal HP / Max HP, same as Lifeline (Q 2026-10-16; was Max HP 210). Each time attacked: +1 per hit taken,
   * +2 per hit blocked, +3 per facing card. Cap 500. Only Max HP grows; current HP does not
   * heal (Q nerf 2026-10-15).
   * Q buff 2026-10-16: every 20 Max HP grown this way = +1 dmg on every card you strike with (Max HP lost later doesn't undo it).
   * Q buff 2026-10-25 (vs Pyromancer): end of every turn, +perDebuff (2) Max HP per debuff stack on you (debuffStacks).
   */
  'TK:2': {
    name: 'Titan Bloom',
    afterHits: (state, side, r) => {
      if (!r.attacked) return
      const p = state.players[side]
      const f = tuningOf(state, side)['TK:2']
      const gain = Math.min(f.maxHpCap - p.maxHp, r.hitsTaken * f.perHitTaken + r.hitsBlocked * f.perHitBlocked + r.facing * f.perFacing)
      if (gain <= 0) return
      p.maxHp += gain
      p.styleData = { ...p.styleData, grown: (p.styleData?.grown ?? 0) + gain }
      say(state, side, `Titan Bloom: Max HP +${gain} → ${p.maxHp}`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.hp <= 0) return
      const f = tuningOf(state, side)['TK:2']
      const stacks = debuffStacks(p)
      const gain = Math.min(f.maxHpCap - p.maxHp, stacks * f.perDebuff)
      if (gain <= 0) return
      p.maxHp += gain
      p.styleData = { ...p.styleData, grown: (p.styleData?.grown ?? 0) + gain }
      say(state, side, `Titan Bloom: ${stacks} debuff stack${stacks === 1 ? '' : 's'}, Max HP +${gain} → ${p.maxHp}`)
    },
    beforeHits: (state, side, bonus) => {
      const n = overgrowthDmg(state.players[side], tuningOf(state, side))
      if (!n) return
      for (let i = 0; i < bonus.length; i++) bonus[i] += n
      say(state, side, `Titan Bloom: all cards +${n} dmg`)
    },
  },
}


Object.assign(STYLES, {
  /** Bruiser · Fury: while HP < 50%, cards in slot 1 and 2 of your Strike chain deal +10 dmg. */
  'BR:1': {
    name: 'Fury',
    beforeHits: (state, side, bonus) => {
      const f = tuningOf(state, side)['BR:1']
      if (pctHp(state.players[side]) >= f.hpPct) return
      for (let i = 0; i < Math.min(f.slots, bonus.length); i++) bonus[i] += f.bonusDmg
      say(state, side, `Fury: slots 1–${f.slots} +${f.bonusDmg} dmg`)
    },
  },
  /**
   * Bruiser · Juggernaut (Q 2026-10-16, Momentum + Tenacity merged; name by Claude).
   * Every Strike: +1 Momentum stack per card in the chain, before it hits (max 6; see applyConqueror in combos.ts).
   * When the stacks reach max: Tenacity for the next 2 turns (a charge break can't throw away the slot 1 card).
   * Every turn you Block: −1 stack. Charge keeps the stacks (no gain, no loss; Q 2026-10-16 22:03Z).
   */
  'BR:2': {
    name: 'Juggernaut',
    strikeStart: (state, side, chain) => {
      const p = state.players[side]
      const f = tuningOf(state, side)['BR:2']
      const max = f.conquerorMax
      const was = p.comboData?.conqueror ?? 0
      const n = Math.min(max, was + chain.length)
      if (n === was) return
      p.comboData = { ...p.comboData, conqueror: n }
      say(state, side, `Juggernaut: Momentum ${n}/${max}${n === max ? ' (Lifesteal)' : ''}`)
      if (n === max) {
        p.styleData = { ...p.styleData, tenacityFrom: state.turn }
        say(state, side, `Juggernaut: Tenacity ${f.tenacityTurns} turns (slot 1 safe from charge break)`)
      }
    },
    chargeBreakSafe: (state, side) => {
      const from = state.players[side].styleData?.tenacityFrom
      return from != null && state.turn > from && state.turn <= from + tuningOf(state, side)['BR:2'].tenacityTurns ? 1 : 0
    },
    endTurn: (state, side, action) => {
      const p = state.players[side]
      const n = p.comboData?.conqueror ?? 0
      if (action !== 'block' || !n) return
      const f = tuningOf(state, side)['BR:2']
      const left = Math.max(0, n - f.blockLoss)
      p.comboData = { ...p.comboData, conqueror: left }
      say(state, side, `Juggernaut: Block, Momentum ${left}/${f.conquerorMax}`)
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
    startDraw: (t) => t['AS:1'].startDraw,
    /**
     * Overdrive (Q 2026-10-16): Strike with 3+ cards (was a full Field of 5) and no S card in the chain → all Energy
     * left is spent, every card in the chain gets +dmgPerEnergy dmg per Energy spent (Claude default).
     * A Style, so Silence doesn't stop it.
     */
    beforeHits: (state, side, bonus, _mult, _crit, chain) => {
      const p = state.players[side]
      const energy = p.res ?? 0
      const add = overdriveAdd(state, side, chain ?? p.hand)
      if (!add) return
      for (let i = 0; i < bonus.length; i++) bonus[i] += add
      p.res = 0
      p.styleData = { ...p.styleData, odTurn: state.turn } // for loadout pieces that react to an Overdrive
      say(state, side, `Sonic Bliz Overdrive: spends all ${energy} Energy → every chain card +${add} dmg`)
    },
    // Acceleration (Q 2026-10-16, replaces Extra Hits): Strike meets Strike → Energy full + draw 2 at the end of the turn
    dualStrike: { draw: (t) => t['AS:1'].dualDraw, fillRes: true },
  },
  /** Assassin · Fatal Rhythm: every 4th attack (counted across turns, blocked ones too) is a Critical: 3x dmg,
   *  4x while the enemy's HP is in the red (below 30% of Max HP at the start of the Strike, like the HP bar).
   *  A blocked Critical still deals 50% (engine dealtOf). */
  'AS:2': {
    name: 'Fatal Rhythm',
    beforeHits: (state, side, _bonus, mult, crit) => {
      const p = state.players[side]
      const enemy = state.players[side === 'p1' ? 'p2' : 'p1']
      const f = tuningOf(state, side)['AS:2']
      const x = enemy.hp * 100 < enemy.maxHp * f.redHpPct ? f.redCritMult : f.critMult
      const before = p.styleData?.attacks ?? 0
      mult.forEach((_, i) => {
        if ((before + i + 1) % f.every === 0) {
          mult[i] *= x
          crit.add(i)
          say(state, side, `Fatal Rhythm Critical: slot ${i + 1} (attack #${before + i + 1}) dmg x${x}`)
        }
      })
      p.styleData = { ...p.styleData, attacks: before + mult.length }
    },
  },
} satisfies Record<string, StyleDef>)

Object.assign(STYLES, {
  /**
   * Mage · Pyromancer (Q 2026-10-17, replaces Mana Flow; reworked the same day so it costs no extra Mana).
   * ⟡ Infuse (Q 2026-10-19, replaces Touch of Flame): every Skill card you paid for, hit clean or Blocked,
   * gives the opponent 1 Ignite (MG.infusePerS) after your chain.
   * Molten Shield (first version, Q asked it back): a Block with Mana spends up to 3 of it for Shield 5 per Mana
   * this turn, and each hit that Block stops gives the attacker 1 Ignite. No Mana, no Molten Shield.
   */
  'MG:1': {
    name: 'Pyromancer',
    infuse: addIgnite,
    afterChain: (state, side, r) => {
      infuseChain(state, side, r, '🔥 Ignite')
      return 0
    },
    actionStart: (state, side, action) => {
      const p = state.players[side]
      // Molten Shield v1 (Q asked it back 2026-10-17): Block spends up to 3 Mana, Shield 5 per Mana
      const f = tuningOf(state, side)['MG:1']
      if (action !== 'block' || !state.rules.resources || (p.res ?? 0) <= 0 || f.moltenMaxMana <= 0) return
      const spent = Math.min(f.moltenMaxMana, p.res ?? 0)
      p.res = (p.res ?? 0) - spent
      // turns 1: an old-shield tick at the end of this turn removes it
      p.statuses.push({ kind: 'shield', turns: 1, n: spent * f.moltenShieldPerMana })
      p.styleData = { ...p.styleData, molten: 1, moltenSpent: spent }
      say(state, side, `Molten Shield: spends ${spent} Mana → Shield ${spent * f.moltenShieldPerMana} this turn, blocked hits Ignite`)
    },
    afterHits: (state, side, r) => {
      const p = state.players[side]
      const per = tuningOf(state, side)['MG:1'].moltenIgnite
      if (!p.styleData?.molten || !r.hitsBlocked || per <= 0) return
      const n = addIgnite(state, other(side), r.hitsBlocked * per)
      say(state, side, `Molten Shield: blocked ${r.hitsBlocked} hits → enemy gets 🔥 Ignite (${n} stacks)`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.molten) p.styleData = { ...p.styleData, molten: 0 }
    },
  },
  /**
   * Mage · Cryomancer (Q 2026-10-18, from a Gemini draft; replaces Frostbinder).
   * Frost Armor: start the game with Shield 40; every hit a Shield soaks gives the attacker 1 Chill.
   * ⟡ Infuse (Q 2026-10-19, replaces Deep Freeze): every Skill card you paid for, hit clean or Blocked,
   * gives the opponent 1 Chill (MG.infusePerS) after your chain. No extra Mana.
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
    infuse: addChill,
    setup: (p, t) => {
      if (t['MG:2'].frostArmorShield > 0) p.statuses.push({ kind: 'shield', turns: 9999, n: t['MG:2'].frostArmorShield })
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
        say(state, side, `Arcane Sub-Zero: ${r.cleanHits} clean hits → enemy gets ❄ Chill${n ? ` (${n} stacks)` : ''}`)
      }
      infuseChain(state, side, r, '❄ Chill')
      return 0
    },
    afterHits: (state, side, r) => {
      if (!r.shieldHits) return
      const n = addChill(state, other(side), r.shieldHits)
      say(state, side, `Frost Armor: Shield took ${r.shieldHits} hits → enemy gets ❄ Chill${n ? ` (${n} stacks)` : ''}`)
    },
    onHpLoss: (state, side) => {
      const p = state.players[side]
      const at = p.styleData?.tombAt
      if (at !== undefined) {
        // sealed this turn: the rest of the turn's dmg can't finish you
        if (at === state.turn && p.hp <= 0) p.hp = 1
        return
      }
      const f = tuningOf(state, side)['MG:2']
      if (p.hp > 0 && pctHp(p) >= f.tombHpPct) return
      const saved = p.hp <= 0
      if (saved) p.hp = 1
      p.styleData = { ...p.styleData, tombAt: state.turn }
      p.statuses = p.statuses.filter((s) => s.kind !== 'shield')
      if (f.frostArmorShield > 0) p.statuses.push({ kind: 'shield', turns: 9999, n: f.frostArmorShield })
      // read by next turn's legal actions, gone after it (statuses tick at the start of a turn)
      p.statuses.push({ kind: 'noStrike', turns: 1 }, { kind: 'noCharge', turns: 1 }, { kind: 'frozenTomb', turns: 1 })
      say(state, side, `🧊 Frozen Tomb${saved ? ' (survives at 1 HP)' : ''}: Frost Armor Shield ${f.frostArmorShield} is back, Block only next turn`)
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.styleData?.subZero) p.styleData = { ...p.styleData, subZero: 0 }
      const at = p.styleData?.tombAt
      if (at === undefined || p.hp <= 0) return
      const f = tuningOf(state, side)['MG:2']
      if (state.turn === at + 1) {
        const mana = state.rules.resources ? (p.res ?? 0) : 0
        if (state.rules.resources) p.res = 0
        const got = styleHeal(state, side, f.tombHeal + f.tombHealPerMana * mana)
        say(state, side, `🧊 Frozen Tomb: spends ${mana} Mana, heals ${got} HP`)
      } else if (state.turn === at + 2) {
        const left = p.statuses.filter((s) => s.kind === 'shield').reduce((t, s) => t + (s.n ?? 0), 0)
        p.statuses = p.statuses.filter((s) => s.kind !== 'shield')
        const got = styleHeal(state, side, Math.floor((left * f.tombMeltPct) / 100))
        say(state, side, `🧊 Frozen Tomb melts: ${left} Shield left → heals ${got} HP`)
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
  const f = tuningOf(state, side)['AS:1']
  if (chain.length < f.minChain || chain.some((c) => c.def.type === 'S')) return 0
  return (p.res ?? 0) * f.dmgPerEnergy
}

export const getStyle = (key?: string | null) => (key ? STYLES[key] : undefined)

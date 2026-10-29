// Champion Styles (passives). Code registry keyed by "CHAMP:slot" (champion_styles.slot).
// Kept free of state.ts imports so createGame can call setup without an import cycle.
import { freeze } from './combos'
import { resIn, styleOn, wrapInClass } from './classes'
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

/** Add n Chill stacks to a side and reset its timer. Reaching chillMax freezes it (Shatter comes later, on a hit). Returns the stacks it has now (0 after a freeze). */
export function addChill(state: GameState, side: Side, n: number): number {
  const p = state.players[side]
  // the numbers of whoever applies it (the other side)
  const t = tuningOf(state, other(side))['MG:2']
  const cur = p.statuses.find((s) => s.kind === 'chill')
  if (!cur && n <= 0) return 0
  const stacks = Math.min(t.chillMax, (cur?.n ?? 0) + n)
  p.statuses = p.statuses.filter((s) => s.kind !== 'chill')
  if (stacks >= t.chillMax && !t.chillNoFreeze && freeze(state, side, `${t.chillMax} Chill`)) return 0
  p.statuses.push({ kind: 'chill', turns: t.chillTurns, n: stacks })
  return stacks
}

/** Shield points a side has left */
export const shieldOf = (p: PlayerState) => p.statuses.filter((s) => s.kind === 'shield').reduce((t, s) => t + (s.n ?? 0), 0)
/** Grow one lasting Shield by n, keeping the side's total Shield at most cap. Returns what it gained. */
export function growShield(p: PlayerState, n: number, cap: number): number {
  if (p.perkData?.noShield) return 0
  const add = Math.min(n, cap - shieldOf(p))
  if (add <= 0) return 0
  const lasting = p.statuses.find((s) => s.kind === 'shield' && s.turns > 9000)
  if (lasting) lasting.n = (lasting.n ?? 0) + add
  else p.statuses.push({ kind: 'shield', turns: 9999, n: add })
  return add
}

export const igniteStacks = (p: PlayerState) => p.statuses.find((s) => s.kind === 'ignite')?.n ?? 0
/** HP one end-of-turn burn takes. */
export const igniteBurn = (p: PlayerState, t: Tuning) => {
  const n = igniteStacks(p)
  const f = t['MG:1']
  return n * f.igniteFlat + Math.floor((p.maxHp * n * f.ignitePctMaxHp) / 100)
}
/** also a loadout heal cut (perkData.healPct, e.g. Second Wind's Cost) */
export const healAfterIgnite = (p: PlayerState, n: number, t: Tuning) =>
  Math.floor((n * (100 - Math.min(t['MG:1'].healCutMax, t['MG:1'].healCutPerStack * igniteStacks(p))) * (p.perkData?.healPct ?? 100)) / 10000)

/** Card heals on this side: Titan Bloom gets only TK:2 cardHealPct % of them (Tank v3, Q 2026-10-27). */
export const cardHeal = (state: GameState, side: Side, n: number) =>
  styleOn(state.players[side], 'TK:2') ? Math.floor((n * tuningOf(state, side)['TK:2'].cardHealPct) / 100) : n

/** Lifeline Resolve (C2): healing past Max HP becomes Shield, up to perkData.overShield in all. n = the heal after cuts. */
export function overhealShield(p: PlayerState, n: number) {
  const cap = p.perkData?.overShield ?? 0
  const over = p.hp + n - p.maxHp
  if (cap > 0 && over > 0) growShield(p, over, cap)
}

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
  hitsParried: number // hits this side's Parry deflected
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
  criticalHits: number // Critical cards in this chain
  criticalBlocked: number // Critical cards stopped by Block
  criticalClean: number // Critical cards that dealt HP damage
  criticalParried: number // Critical cards deflected by Parry
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
  beforeHits?: (state: GameState, side: Side, bonus: number[], mult: number[], crit: Set<number>, chain?: CardInst[], pierce?: number[], piercePct?: number[], enemyChain?: CardInst[]) => void
  /** Strike chains only: after this side's chain has hit. Returns extra hits it landed (they count as hits taken). */
  afterChain?: (state: GameState, side: Side, r: ChainReport) => number
  /** Strike chains only: right after Before action combos, before Momentum and any hit (e.g. Juggernaut stacks) */
  strikeStart?: (state: GameState, side: Side, chain: CardInst[]) => void
  /** How many leading Field slots a charge break can't throw away (default 0 = oldest card is lost) */
  chargeBreakSafe?: (state: GameState, side: Side) => number
  /** this side was hit while Charging (Charge break), after the Field card is lost */
  onChargeBreak?: (state: GameState, side: Side) => void
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
  /** How many hits a turn hitCut applies to (Endurance: stacks − 1); unset = every hit */
  hitCutHits?: (state: GameState, side: Side) => number
  /** hitCut skips this many hits a turn before it starts (Lifeline Resolve: the 2 hits after the first) */
  hitCutSkip?: (state: GameState, side: Side) => number
  /** % less HP lost to Ignite burns (Endurance) */
  burnCutPct?: (state: GameState, side: Side) => number
  /** % less dmg from Critical hits taken (Endurance) */
  critCutPct?: (state: GameState, side: Side) => number
  /** Cost: every hit this side's Block stops after the first still deals this % of its dmg */
  blockLeakPct?: (state: GameState, side: Side) => number
  /** Cost: every hit this side's Block stops deals this % of its dmg */
  blockDmgPct?: (state: GameState, side: Side) => number
  /** cards drawn at the end of the turn, after Dual Strike draws (Cryomancer Flash Freeze) */
  endDraw?: (state: GameState, side: Side) => number
  /** extra cards a Charge that isn't broken draws, decided per turn */
  extraChargeDraw?: (state: GameState, side: Side) => number
  /** Mach Speed: when this side Strikes into a Charge, a small Acceleration: draw this many, no Energy */
  dualOnCharge?: (state: GameState, side: Side) => number
  /** this side's Cut effects Cut n more cards (still within CUT_CAP a turn) */
  cutMore?: (state: GameState, side: Side) => number
}

/** A Style or loadout piece that acts in the game: same hooks. Loadout pieces register here (engine/loadout.ts). */
export const PERK_HOOKS: Record<string, StyleDef> = {}

/** Everything that hooks into a side's turn: its Style, then its loadout pieces in order. */
export function hooksOf(p: PlayerState): StyleDef[] {
  // the boss: every class's Style and capstone, each run as its class
  if (p.boss) {
    const b = p.boss
    return [
      ...b.classes.flatMap((c) => (STYLES[b.styles[c]] ? [wrapInClass(p, c, STYLES[b.styles[c]])] : [])),
      ...(p.perks ?? []).flatMap((k) => (PERK_HOOKS[k] ? [wrapInClass(p, k.split(':')[1], PERK_HOOKS[k])] : [])),
    ]
  }
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
  const got = healAfterIgnite(p, n, tuningOf(state, other(side)))
  overhealShield(p, got)
  p.hp = Math.min(p.maxHp, p.hp + got)
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
   * Tank · Lifeline v3 (Q 2026-10-28, design/tank-rework-v3-lifeline-asc-2026-10-28.md): ⛨ Endurance canisters, cap endMax.
   * Gain 1 (once a turn per source) when you pay an S card's HP cost, when one hit deals you endHeavyPct% of your Max HP,
   * or when 2+ hits reach you in a turn. When you Strike, collect them all: heal endHealPct% of missing HP each (×2 in the red)
   * and slot 1 +endSlotDmg each. Reaching the cap on a turn you didn't Strike: counter-spin (spinDmg each, ignores Block / Shield).
   * In the red an S card is paid with 1 Endurance instead of HP (resources.ts payChain).
   */
  'TK:1': {
    name: 'Lifeline',
    actionStart: (state, side, action) => {
      const p = state.players[side]
      p.perkData = { ...p.perkData, struckAt: action === 'strike' ? state.turn : (p.perkData?.struckAt ?? 0) }
    },
    strikeStart: (state, side, chain) => {
      const p = state.players[side]
      p.perkData = { ...p.perkData, paidS: chain.filter((c) => c.def.type === 'S' && (c.paidHp ?? 0) > 0).length }
    },
    beforeHits: (state, side, bonus) => {
      const p = state.players[side]
      const n = endurance(p)
      if (!n || !bonus.length) return
      const f = tuningOf(state, side)['TK:1']
      const red = pctHp(p) < f.hpPct
      const got = styleHeal(state, side, Math.floor(((p.maxHp - p.hp) * f.endHealPct * n * (red ? 2 : 1)) / 100))
      bonus[0] += f.endSlotDmg * n
      // Ascendancy: A2 every card +1 per Endurance, D3 Culling Blade +2 per card per Endurance
      const perCard = ((p.perkData?.collectAll ?? 0) + (p.perkData?.culling ?? 0)) * n
      if (perCard) for (let i = 0; i < bonus.length; i++) bonus[i] += perCard
      p.perkData = { ...p.perkData, endurance: 0 }
      say(state, side, `⛨ Collect ${n} Endurance: heal ${got}, slot 1 +${f.endSlotDmg * n}${perCard ? `, every card +${perCard}` : ''} dmg`)
    },
    afterChain: (state, side) => {
      const p = state.players[side]
      if ((p.perkData?.paidS ?? 0) > 0) gainEndurance(state, side, 'paid an S card with HP', 'pay')
      p.perkData = { ...p.perkData, paidS: 0 }
      return 0
    },
    afterHits: (state, side, r) => {
      const p = state.players[side]
      if (p.hp <= 0) return
      const heavy = Math.ceil((p.maxHp * tuningOf(state, side)['TK:1'].endHeavyPct) / 100)
      if (state.events?.some((e) => e.k === 'hit' && e.side === other(side) && e.dealt >= heavy)) gainEndurance(state, side, 'heavy hit', 'heavy')
      if (r.hitsTaken >= 2) gainEndurance(state, side, `${r.hitsTaken} hits`, 'hits')
    },
  },

  /**
   * Tank · Titan Bloom v3 (Q 2026-10-28, design/tank-rework-v3-titan-bloom-2026-10-28.md).
   * Growth (Max HP only): perHitTaken per hit taken, perHitBlocked per hit Blocked, perDebuff per debuff stack at the end of the turn.
   * Vigor (Max HP and current HP; keys still say meat): perFacing per facing pair, meatPct% of Max HP per clean hit you land. Cap maxHpCap.
   * Every hpPerDmg grown = every card +1 dmg. Colossus (grown > treeAt, keys still say tree): every card +treeDmg, Field max treeField.
   * A Strike of throwCards+ cards as a Colossus is a Colossus Slam: every card +throwDmg instead, lose throwCost grown.
   * Card heals give only cardHealPct% (cardHeal).
   */
  'TK:2': {
    name: 'Titan Bloom',
    setup: (p) => {
      p.styleData = { ...p.styleData, fieldBase: p.fieldMax ?? 0 }
    },
    afterHits: (state, side, r) => {
      if (!r.attacked) return
      const p = state.players[side]
      const f = tuningOf(state, side)['TK:2']
      const grew = bloom(state, side, r.hitsTaken * f.perHitTaken + r.hitsBlocked * f.perHitBlocked, false)
      const meat = p.hp > 0 ? bloom(state, side, r.facing * f.perFacing, true) : 0
      if (grew + meat) say(state, side, `Titan Bloom: Max HP +${grew + meat}${meat ? ` (Vigor +${meat} HP)` : ''} → ${p.maxHp}`)
      // growing past the tree line shrinks the Field now, before this turn's Charge draw fills it
      treeField(state, side)
    },
    afterChain: (state, side, r) => {
      const p = state.players[side]
      if (!r.cleanHits || p.hp <= 0) return 0
      const f = tuningOf(state, side)['TK:2']
      const per = Math.floor((p.maxHp * (f.meatPct + (p.perkData?.meatClean ?? 0))) / 100)
      const got = bloom(state, side, r.cleanHits * per, true)
      if (got) say(state, side, `Titan Bloom: ${r.cleanHits} clean hits, Vigor +${got}`)
      return 0
    },
    endTurn: (state, side) => {
      const p = state.players[side]
      if (p.hp > 0) {
        const stacks = debuffStacks(p)
        const gain = bloom(state, side, stacks * tuningOf(state, side)['TK:2'].perDebuff, false)
        if (gain) say(state, side, `Titan Bloom: ${stacks} debuff stack${stacks === 1 ? '' : 's'}, Max HP +${gain} → ${p.maxHp}`)
      }
      treeField(state, side)
    },
    beforeHits: (state, side, bonus) => {
      const p = state.players[side]
      const t = tuningOf(state, side)
      const f = t['TK:2']
      let n = overgrowthDmg(p, t)
      const grown = p.styleData?.grown ?? 0
      if (grown > f.treeAt && bonus.length >= f.throwCards) {
        n += f.throwDmg
        const lose = Math.min(grown, f.throwCost)
        const hpWas = p.hp
        p.maxHp = Math.max(1, p.maxHp - lose)
        p.hp = Math.min(p.hp, p.maxHp)
        // the HP bar plays events back: without one it showed the old HP until the turn ended
        if (p.hp < hpWas) (state.events ??= []).push({ k: 'hp', side, delta: p.hp - hpWas })
        p.styleData = { ...p.styleData, grown: grown - lose }
        treeField(state, side)
        say(state, side, `🛡️ Colossus Slam: every card +${f.throwDmg} dmg, Max HP −${lose}`)
      } else if (grown > f.treeAt) n += f.treeDmg
      if (!n) return
      for (let i = 0; i < bonus.length; i++) bonus[i] += n
      say(state, side, `Titan Bloom: all cards +${n} dmg`)
    },
  },
}

/** Titan Bloom: grow Max HP by n (up to the cap); meat = current HP grows too. Returns what it grew. */
export function bloom(state: GameState, side: Side, n: number, meat: boolean): number {
  const p = state.players[side]
  const gain = Math.min(tuningOf(state, side)['TK:2'].maxHpCap - p.maxHp, n)
  if (gain <= 0) return 0
  p.maxHp += gain
  if (meat && p.hp > 0) {
    p.hp += gain
    ;(state.events ??= []).push({ k: 'hp', side, delta: gain })
  }
  p.styleData = { ...p.styleData, grown: (p.styleData?.grown ?? 0) + gain }
  return gain
}

/** Titan Bloom holds the tree (grown > treeAt): its Field shrinks to treeField; otherwise back to the loadout's size. */
function treeField(state: GameState, side: Side) {
  const p = state.players[side]
  const f = tuningOf(state, side)['TK:2']
  const base = p.styleData?.fieldBase || undefined
  const holding = (p.styleData?.grown ?? 0) > f.treeAt
  p.fieldMax = holding ? Math.min(base ?? Infinity, f.treeField) : base
}

/** Lifeline Endurance (Tank v3): canisters in perkData.endurance */
export const endurance = (p: PlayerState) => p.perkData?.endurance ?? 0

/** HP loss from a Style or loadout piece (not a hit): runs onHpLoss hooks, counts as the opponent's doing for Rage. */
export function styleHurt(state: GameState, side: Side, n: number) {
  const p = state.players[side]
  const before = p.hp
  p.hp = Math.max(0, p.hp - n)
  if (p.hp >= before) return
  for (const h of hooksOf(p)) h.onHpLoss?.(state, side)
  ;(state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
  p.otherDmg ??= { foe: 0, self: 0 }
  p.otherDmg.foe++
}

/** Lifeline: gain Endurance (once a turn per source). Reaching the cap on a turn this side didn't Strike: counter-spin. */
export function gainEndurance(state: GameState, side: Side, why: string, src: string, by = 1) {
  const p = state.players[side]
  if (!styleOn(p, 'TK:1') || p.hp <= 0) return
  const at = `endAt_${src}`
  if (p.perkData?.[at] === state.turn) return
  const max = tuningOf(state, side)['TK:1'].endMax
  const n = Math.min(max, endurance(p) + by)
  p.perkData = { ...p.perkData, endurance: n, [at]: state.turn }
  say(state, side, `⛨ Endurance (${why}): ${n}/${max}`)
  if (n >= max && p.perkData.struckAt !== state.turn) counterSpin(state, side, 'full')
}

/** Lifeline counter-spin: spend all Endurance, spinDmg each to the opponent's HP (ignores Block and Shield). */
export function counterSpin(state: GameState, side: Side, why: string) {
  const p = state.players[side]
  const n = endurance(p)
  if (!n || p.hp <= 0) return
  const dmg = n * tuningOf(state, side)['TK:1'].spinDmg
  p.perkData = { ...p.perkData, endurance: 0 }
  styleHurt(state, other(side), dmg)
  say(state, side, `🌀 Counter-spin (${why}): spends ${n} Endurance, deals ${dmg}`)
  // A3 (Ascendancy): this turn's hit dmg is halved and you heal spinGuard% of missing HP per Endurance spent
  const guard = p.perkData?.spinGuard ?? 0
  if (!guard) return
  const took = (state.events ?? []).reduce((t, e) => t + (e.k === 'hit' && e.side === other(side) ? e.dealt : 0), 0)
  const back = Math.min(p.maxHp - p.hp, Math.floor(took / 2))
  if (back > 0) {
    p.hp += back
    ;(state.events ??= []).push({ k: 'hp', side, delta: back })
  }
  const got = styleHeal(state, side, Math.floor(((p.maxHp - p.hp) * guard * n) / 100))
  say(state, side, `🌀 Counter-spin guard: ${back} hit dmg undone, heals ${got}`)
}


Object.assign(STYLES, {
  /**
   * Bruiser · Fury (Hybrid rework):
   * – Warm-up (HP > line, Rage ≥ warmUpRage): Fury slots get +warmUpDmg dmg.
   * – True Fury (HP < line): Fury slots get +bonusDmg dmg; blocked Fury hits
   *   deal chipDmg to the enemy and gain chipRage Rage (Chip Damage).
   */
  'BR:1': {
    name: 'Fury',
    beforeHits: (state, side, bonus) => {
      const f = tuningOf(state, side)['BR:1']
      const hp = pctHp(state.players[side])
      const trueFury = hp < f.hpPct
      const warmUp = !trueFury && (state.players[side].res ?? 0) >= f.warmUpRage
      if (!trueFury && !warmUp) return
      const dmg = trueFury ? f.bonusDmg : f.warmUpDmg
      for (let i = 0; i < Math.min(f.slots, bonus.length); i++) bonus[i] += dmg
      say(state, side, trueFury
        ? `True Fury: slots 1–${f.slots} +${dmg} dmg (Chip active)`
        : `Fury Warm-up: slots 1–${f.slots} +${dmg} dmg`)
    },
    afterChain: (state, side, r) => {
      const f = tuningOf(state, side)['BR:1']
      if (pctHp(state.players[side]) >= f.hpPct) return 0 // Chip only in True Fury
      if (!f.chipDmg && !f.chipRage) return 0
      // non-clean hits ≈ blocked hits (also counts Parry/Shield-absorbed-to-0, rare edge case)
      const blocked = r.chainLength - r.cleanHits
      const chipSlots = Math.min(f.slots, blocked)
      if (chipSlots <= 0) return 0
      const chip = chipSlots * f.chipDmg
      const rage = chipSlots * f.chipRage
      if (chip > 0) {
        const enemy = other(side)
        const p = state.players[enemy]
        const before = p.hp
        p.hp = Math.max(0, p.hp - chip)
        if (p.hp < before) {
          for (const h of hooksOf(p)) h.onHpLoss?.(state, enemy)
          ;(state.events ??= []).push({ k: 'hp', side: enemy, delta: p.hp - before })
        }
      }
      if (rage > 0) {
        const p = state.players[side]
        const cap = tuningOf(state, side).BR?.cap ?? 20
        p.res = Math.min(cap, (p.res ?? 0) + rage)
      }
      say(state, side, `Fury Chip: ${chipSlots} blocked → ${chip} dmg + ${rage} Rage`)
      return 0
    },
  },
  /**
   * Bruiser · Juggernaut (Q 2026-10-16, Momentum + Tenacity merged; name by Claude).
   * Every Strike: +1 Momentum stack per card in the chain, before it hits (max 6; see applyConqueror in combos.ts).
   * When the stacks reach max: Tenacity for the next 2 turns (a charge break can't throw away the slot 1 card).
   * Every turn you Block: −1 stack, unless a card gave you holdMomentum (Iron Stance). Charge keeps the stacks (no gain, no loss; Q 2026-10-16 22:03Z).
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
      if (p.statuses.some((s) => s.kind === 'holdMomentum')) return say(state, side, `Juggernaut: Block, Momentum held ${n}`)
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
      let counter = p.styleData?.attacks ?? 0
      let skip = p.perkData?.skipCritCounter ?? 0
      for (let i = 0; i < mult.length; i++) {
        if (skip > 0) {
          skip--
          continue
        }
        counter++
        if (counter % f.every !== 0) continue
        mult[i] *= x
        crit.add(i)
        say(state, side, `Fatal Rhythm Critical: slot ${i + 1} (attack #${counter}) dmg x${x}`)
      }
      p.perkData = { ...p.perkData, skipCritCounter: skip }
      p.styleData = { ...p.styleData, attacks: counter }
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
   * Chill clears and it can't Strike next turn, then Thaw keeps it from being Frozen again for a while (combos.ts freeze).
   * Shatter (Q 2026-10-25, Ice Lance pattern): your first clean hit on a Frozen enemy takes shatterPct of its Max HP,
   * so the Frozen side guesses Block (stops the hits) or Charge. Flash Freeze draws you cards for that Strike.
   * Frost Armor regrows (Q 2026-10-25, StS Frost orb): every turn you Block an enemy Strike, Shield +frostArmorRegen up to frostArmorCap.
   * Block vs Charge regrows nothing (Q 2026-10-26: no free Shield from Block spam).
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
      // the enemy is Frozen this turn (can't Strike): a clean hit now Shatters
      const foe = state.players[other(side)].statuses
      p.styleData = { ...p.styleData, foeFrozen: foe.some((s) => s.kind === 'frozen') && foe.some((s) => s.kind === 'noStrike') ? 1 : 0 }
    },
    afterChain: (state, side, r) => {
      const p = state.players[side]
      // Shatter before Infuse, so a Freeze from this very chain waits for the next Strike
      const ice = state.players[other(side)].statuses.find((s) => s.kind === 'frozen')
      if (p.styleData?.foeFrozen && r.cleanHits && ice && !((ice.n ?? 0) & 4)) {
        ice.n = (ice.n ?? 0) | 4 // once per Freeze
        const foe = state.players[other(side)]
        const before = foe.hp
        const lost = Math.floor((foe.maxHp * tuningOf(state, side)['MG:2'].shatterPct) / 100)
        foe.hp = Math.max(0, foe.hp - lost)
        if (foe.hp < before) {
          for (const h of hooksOf(foe)) h.onHpLoss?.(state, other(side))
          ;(state.events ??= []).push({ k: 'hp', side: other(side), delta: foe.hp - before })
        }
        say(state, side, `💥 Shatter: clean hit on a Frozen enemy → ${lost} HP`)
      }
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
    endDraw: (state, side) => {
      const p = state.players[side]
      const n = p.styleData?.freezeDraw ?? 0
      if (n) p.styleData = { ...p.styleData, freezeDraw: 0 }
      return n
    },
    endTurn: (state, side, action, enemyAction) => {
      const p = state.players[side]
      if (p.styleData?.subZero) p.styleData = { ...p.styleData, subZero: 0 }
      const t = tuningOf(state, side)['MG:2']
      if (action === 'block' && enemyAction === 'strike' && p.hp > 0) {
        const got = growShield(p, t.frostArmorRegen, t.frostArmorCap)
        if (got) say(state, side, `Frost Armor regrows: Shield +${got}`)
      }
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
  if (!styleOn(p, 'AS:1') || !state.rules.resources || resIn(p, 'AS') <= 0) return 0
  const f = tuningOf(state, side)['AS:1']
  if (chain.length < f.minChain || chain.some((c) => c.def.type === 'S')) return 0
  return resIn(p, 'AS') * f.dmgPerEnergy
}

export const getStyle = (key?: string | null) => (key ? STYLES[key] : undefined)

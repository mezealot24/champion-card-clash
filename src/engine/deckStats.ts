// Build overview stats (Q 2026-10-29): five 0-10 numbers that sum up a deck + its Style, Ascendancy and Oath.
// HP = health and healing · Defend = dmg you don't take · ATK = dmg you deal · Technique = hard conditions with a big
// payoff, or unique tricks · Speed = more cards per turn. One scale for the whole game (Tank HP 10 > any Mage build).
// Read from the cards' effect_json and Max HP, so Admin retunes show up by themselves. Rubric and weights:
// /mnt/project-files/design/deck-preset-stat-rubric.md (keep the two in step).
import type { CardRowLike } from './engine'
import { normalizeSpec, type ActSpec, type CondSpec, type EffectSpec } from './effects/spec'
import type { DmgTarget } from './effects/primitives'
import { OATHS, TREES } from './loadoutData'

export const STAT_KEYS = ['hp', 'def', 'atk', 'tech', 'spd'] as const
export type StatKey = (typeof STAT_KEYS)[number]
export type DeckStats = Record<StatKey, number>
export const STAT_NAMES: Record<StatKey, string> = { hp: 'HP', def: 'Defend', atk: 'ATK', tech: 'Technique', spd: 'Speed' }
export const STAT_MAX = 10

const zero = (): DeckStats => ({ hp: 0, def: 0, atk: 0, tech: 0, spd: 0 })
const add = (a: DeckStats, b: Partial<DeckStats>, k = 1) => STAT_KEYS.forEach((s) => (a[s] += (b[s] ?? 0) * k))

/**
 * Weights. Deck points are counted per card copy (a 25-card deck), then scaled; loadout pieces add straight to the score.
 * Calibrated on the live decks of 2026-10-29 so the Admin decks land around Q's Tank example (HP 10, Defend 8, ATK 5).
 */
export const STAT_WEIGHTS = {
  /** HP: Max HP / hpPerPoint, + heal points × heal */
  hpPerPoint: 50,
  heal: 0.15,
  /** each self HP loss act (recoil, Scar, HP paid for a buff) */
  selfLoss: -0.1,
  /** Defend: everyone can Block */
  defBase: 1,
  def: 0.6,
  /** ATK: deck average base dmg / dmgPerPoint, + boost points × atk */
  dmgPerPoint: 5,
  atk: 0.15,
  tech: 0.24,
  /** Speed: everyone draws on Charge */
  spdBase: 1,
  spd: 0.3,
  /** each Ascendancy node (an Oath or Style kit counts in full) */
  node: 0.5,
  /** extra Technique for a capstone (it has a Cost to play around) */
  capstone: 0.5,
}

// enemy-side dmg targets: a −dmg on them is Defend
const enemyTarget = (t: DmgTarget) => t === 'facing' || t === 'enemyAll' || (typeof t === 'object' && 'enemySlot' in t)
// statuses that lock or blank the enemy: unique tricks (Technique)
const CONTROL = new Set(['noStrike', 'noBlock', 'noCharge', 'silence', 'skillSilence', 'guardBreak', 'deathMark', 'frozen'])
// conditions that are just "you Strike" / "it hit": no setup needed
const EASY = new Set<CondSpec['c']>(['selfAction', 'hitResult', 'hasFacing'])

/** What one Do gives, before weights. */
function actPoints(a: ActSpec): Partial<DeckStats> {
  const self = !('who' in a) || a.who === 'self' || a.who === 'both'
  const enemy = 'who' in a && (a.who === 'enemy' || a.who === 'both')
  switch (a.a) {
    case 'heal':
      return self ? { hp: 1 } : {}
    case 'maxHp':
      return a.n > 0 && self ? { hp: 1 } : enemy && a.n < 0 ? { atk: 1 } : {}
    case 'loseHp':
      return enemy ? { atk: 1 } : { hp: STAT_WEIGHTS.selfLoss / STAT_WEIGHTS.heal }
    case 'draw':
      return self ? { spd: Math.max(1, a.n) } : {}
    case 'addDmg':
      return enemyTarget(a.target) ? (a.n < 0 ? { def: 1 } : {}) : a.n > 0 ? { atk: 1 } : {}
    case 'mulDmg':
      return enemyTarget(a.target) ? (a.pct < 100 ? { def: 1 } : {}) : a.pct > 100 ? { atk: a.pct >= 200 ? 2 : 1 } : {}
    case 'blockNow':
      return self && a.n > 0 ? { def: 1 } : enemy && a.n < 0 ? { atk: 1 } : {}
    case 'pierce':
    case 'shatter':
    case 'ignite':
    case 'consumeIgnite':
    case 'infuse':
      return { atk: 1 }
    case 'chill':
      return { def: 1 }
    case 'steal':
    case 'cut':
      return { tech: 1 }
    case 'status':
      if (a.who === 'self') {
        if (a.kind === 'shield' || a.kind === 'parry' || a.kind === 'blockPlus') return { def: 1 }
        if (a.kind === 'regen') return { hp: 1 }
        if (a.kind === 'empower') return { atk: 1 }
        return {}
      }
      if (CONTROL.has(a.kind)) return { tech: 1 }
      if (a.kind === 'vulnerable' || a.kind === 'trueDmg' || a.kind === 'venom' || a.kind === 'ignite') return { atk: 1 }
      if (a.kind === 'chill') return { def: 1 }
      return {}
    default:
      return {}
  }
}

/** One card's points (one copy), before weights. A rule that needs real setup and pays off adds Technique. */
export function cardPoints(spec: EffectSpec | null | undefined): DeckStats {
  const out = zero()
  for (const rule of normalizeSpec(spec ?? [])) {
    const r = zero()
    rule.do.forEach((a) => add(r, actPoints(a)))
    const setup = (rule.if ?? []).filter((c) => !EASY.has(c.c)).length
    // a payoff behind real setup (slot 3, chain has P + K, HP line, facing card…): more setup and a bigger payoff = more
    if (setup > 0 && STAT_KEYS.some((k) => r[k] > 0)) r.tech += Math.min(2, setup) * 0.5 + (r.atk >= 2 ? 0.5 : 0)
    add(out, r)
  }
  return out
}

/**
 * Loadout tags: what each Style kit, Oath and Ascendancy node mainly helps, as straight score points.
 * Style kits are hand-tagged; Oaths and nodes are read from their text (TAG_RULES), with OVERRIDES for the ones
 * the words get wrong. Nodes count half (STAT_WEIGHTS.node); capstones also give Technique (they come with a Cost to play around).
 */
export const STYLE_TAGS: Record<string, Partial<DeckStats>> = {
  'TK:1': { hp: 1, def: 1 },
  'TK:2': { hp: 2 },
  'BR:1': { atk: 1 },
  'BR:2': { hp: 1, def: 1 },
  'AS:1': { spd: 1.5 },
  'AS:2': { atk: 1, tech: 1 },
  'MG:1': { atk: 1 },
  'MG:2': { def: 2 },
}

const TAG_RULES: [RegExp, StatKey][] = [
  [/\bdraw|cards on your Field|Field cards at start/i, 'spd'],
  [/heal|Lifesteal|Max HP and start HP|Max HP grown|\+\d*\{?\w*\}? Max HP/i, 'hp'],
  [/Shield|Parry|less dmg|deal \{\w+\} less|Block stops every|stops every hit|dmg cut/i, 'def'],
  [/Cut |can't be Blocked|Silenc|can't (Strike|Block|Charge)|finishes them|knocked out|Mark/i, 'tech'],
  [/\+\{?\w*\}? dmg|dmg \+|Critical|Ignite|burn|ignores Block|loses \{\w+\} HP|×\{\w+\}|Overdrive/i, 'atk'],
]

/** Hand tags where the words mislead or say nothing (key = "CHAMP:oath" or "STYLE:NODE", e.g. "TK:1:A1"). */
export const OVERRIDES: Record<string, Partial<DeckStats>> = {
  // Oaths
  'AS:o2': { spd: 2 },
  'TK:o2': { hp: 2 },
  'TK:o3': { def: 1 },
  'BR:o2': { atk: 1 },
  'MG:o1': { tech: 1 },
  // Tank Lifeline: Endurance = heal + slot 1 dmg
  'TK:1:A1': { hp: 1 },
  'TK:1:B1': { hp: 1 },
  'TK:1:D2': { atk: 1 },
  // Tank Titan Bloom: Meat / grown Max HP
  'TK:2:A1': { hp: 1 },
  'TK:2:A2': { hp: 1 },
  'TK:2:B1': { hp: 1 },
  'TK:2:B3': { hp: 1 },
  'TK:2:D1': { hp: 1 },
  // Bruiser Fury: Rage and Fury = dmg
  'BR:1:A1': { atk: 1 },
  'BR:1:A3': { atk: 1 },
  'BR:1:B1': { atk: 1 },
  'BR:1:B3': { atk: 1 },
  'BR:2:B2': { tech: 1 },
  // Cryomancer: Chill cuts dmg, Freeze locks
  'MG:2:A1': { atk: 1 },
  'MG:2:A2': { atk: 1 },
  'MG:2:A3': { tech: 1 },
  'MG:2:B1': { def: 1 },
  'MG:2:B2': { tech: 1 },
  'MG:2:B3': { def: 1 },
  'MG:2:D1': { tech: 1 },
}

export function pieceTags(text: string): Partial<DeckStats> {
  for (const [re, stat] of TAG_RULES) if (re.test(text)) return { [stat]: 1 }
  return {}
}

export type BuildInput = {
  champ: string
  hpMax: number
  /** the deck as played: every card with its copies (picked + Style cards) */
  cards: Pick<CardRowLike, 'dmg' | 'copies' | 'effect_json'>[]
  style?: string
  oath?: string
  asc?: string[]
}

/** Raw (unrounded) scores, for tests and the rubric; buildStats rounds and clamps. */
export function rawStats(b: BuildInput): DeckStats {
  const W = STAT_WEIGHTS
  const deck = zero()
  let dmg = 0
  let n = 0
  for (const c of b.cards) {
    add(deck, cardPoints(c.effect_json), c.copies)
    dmg += c.dmg * c.copies
    n += c.copies
  }
  const out: DeckStats = {
    hp: b.hpMax / W.hpPerPoint + deck.hp * W.heal,
    def: W.defBase + deck.def * W.def,
    atk: (n ? dmg / n : 0) / W.dmgPerPoint + deck.atk * W.atk,
    tech: deck.tech * W.tech,
    spd: W.spdBase + deck.spd * W.spd,
  }
  if (b.style) add(out, STYLE_TAGS[b.style] ?? {})
  const oath = OATHS[b.champ]?.find((o) => o.id === b.oath)
  if (oath) add(out, OVERRIDES[`${b.champ}:${oath.id}`] ?? pieceTags(oath.text))
  const tree = b.style ? TREES[b.style] : undefined
  const depth = tree?.depth ?? 4
  for (const id of b.asc ?? []) {
    const node = tree?.nodes.find((x) => x.id === id)
    if (!node) continue
    add(out, OVERRIDES[`${b.style}:${id}`] ?? pieceTags(`${node.text} ${node.name}`), W.node)
    if (Number(id.slice(1)) === depth) out.tech += W.capstone
  }
  return out
}

const clamp = (v: number) => Math.max(0, Math.min(STAT_MAX, Math.round(v)))

/** The five 0-10 numbers shown in game. */
export function buildStats(b: BuildInput): DeckStats {
  const raw = rawStats(b)
  return Object.fromEntries(STAT_KEYS.map((k) => [k, clamp(raw[k])])) as DeckStats
}

export const statTotal = (s: DeckStats) => STAT_KEYS.reduce((n, k) => n + s[k], 0)

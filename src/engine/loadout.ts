// Loadout (design/customization-options-2026-10-18.md): Sigil I · Oath + Sigil II · Minor + Ascendancy nodes of the
// picked Style. Content and numbers: loadoutData.ts (numbers tunable in Admin). Here is what each piece does.
// A piece changes this player's own numbers (deltas on their tuning copy), sets them up at the start, and/or hooks
// into the turn like a Style (StyleDef hooks, registered in PERK_HOOKS). Pieces never touch the other player's numbers.
import { MINORS, OATHS, TREES } from './loadoutData'
import { resourceOf } from './resources'
import { addIgnite, chillStacks, debuffStacks, hooksOf, igniteStacks, isDebuff, PERK_HOOKS, styleHeal, type StyleDef } from './styles'
import { fieldsOf, tuningOf, type Tuning, type TuningGroup } from './tuning'
import type { GameState, PlayerState, Side } from './types'
import { other } from './types'

/** What a player brings: Oath id, Minor id, Ascendancy node ids of the Style they play ("A1".."B4"), points they may spend. */
export type Loadout = { oath?: string; minor?: string; asc?: string[]; points?: number }

/** HP line the game draws in red (Arena HP bar). */
export const RED_PCT = 30

type Piece = {
  /** change this player's numbers (t is their own copy) */
  tune?: (t: Tuning, v: (key: string) => number, champ: string) => void
  /** once at the start: HP, Field size, costs, starting statuses */
  setup?: (p: PlayerState, v: (key: string) => number) => void
  /** acts during the game like a Style */
  hooks?: Omit<StyleDef, 'name'>
}

// ---- small helpers (no state.ts import: state.ts imports this file) ----
const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const pctHp = (p: PlayerState) => (p.hp * 100) / Math.max(1, p.maxHp)
/** this piece's own number, from the player's numbers */
const num = (state: GameState, side: Side, group: string, key: string) => (tuningOf(state, side) as Record<string, Record<string, number>>)[group]?.[key] ?? 0
const addMaxHp = (p: PlayerState, n: number) => {
  p.maxHp = Math.max(1, p.maxHp + n)
  p.hp = Math.max(1, Math.min(p.maxHp, p.hp + n))
}
const field = (p: PlayerState, n: number) => (p.fieldMax = Math.min(p.fieldMax ?? 5, n))
const cost = (p: PlayerState, pct: number, flat: number) => {
  const c = (p.costMod ??= { pct: 0, flat: 0 })
  c.pct += pct
  c.flat += flat
}
const status = (p: PlayerState, kind: 'shield' | 'parry', n: number) => {
  if (n > 0) p.statuses.push({ kind, turns: 9999, n })
}
/** HP loss from a piece (Thornhide): runs every hook's onHpLoss; counts as the opponent's doing for Rage. */
function hurt(state: GameState, side: Side, n: number) {
  const p = state.players[side]
  const before = p.hp
  p.hp = Math.max(0, p.hp - n)
  if (p.hp >= before) return
  for (const h of hooksOf(p)) h.onHpLoss?.(state, side)
  ;(state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
  p.otherDmg ??= { foe: 0, self: 0 }
  p.otherDmg.foe++
}
/** Once per match: the first call returns true. */
const once = (p: PlayerState, key: string) => {
  if (p.perkData?.[key]) return false
  p.perkData = { ...p.perkData, [key]: 1 }
  return true
}
const add = (t: Tuning, group: string, key: string, n: number) => {
  const g = (t as Record<string, Record<string, number>>)[group]
  if (!g || !(key in g)) return
  const f = fieldsOf(group as TuningGroup).find((x) => x.key === key)
  let v = g[key] + n
  if (f?.min !== undefined) v = Math.max(f.min, v)
  if (f?.max !== undefined) v = Math.min(f.max, v)
  g[key] = v
}
/** Shield points this side has left */
const shieldOf = (p: PlayerState) => p.statuses.filter((s) => s.kind === 'shield').reduce((t, s) => t + (s.n ?? 0), 0)
/**
 * Was the enemy Frozen this turn (a new frozen status)? Each node marks it with its own bit (status.n), so every
 * node that reacts to a Freeze sees it once.
 */
const freshFreeze = (state: GameState, side: Side, bit: number) => {
  const s = state.players[other(side)].statuses.find((x) => x.kind === 'frozen')
  if (!s || ((s.n ?? 0) & bit)) return false
  s.n = (s.n ?? 0) | bit
  return true
}
/** Endurance stacks (Tank Lifeline v2) */
const endurance = (p: PlayerState) => p.perkData?.endurance ?? 0
/** Fury is on for this Strike (Bruiser Style 1) */
const furyOn = (state: GameState, side: Side) => pctHp(state.players[side]) < num(state, side, 'BR:1', 'hpPct')

// ---------------- Sigil I · Oath ----------------
const OATH_FX: Record<string, Piece> = {
  'TK:o1': {
    setup: (p, v) => cost(p, v('bulwarkCostPct'), 0),
    hooks: {
      actionStart: (state, side, action) => {
        if (action === 'block' && once(state.players[side], 'bulwark')) {
          state.players[side].perkData!.bulwarkTurn = state.turn
          say(state, side, 'Bulwark Oath: this Block stops every hit')
        }
      },
      blockBonus: (state, side) => (state.players[side].perkData?.bulwarkTurn === state.turn ? 99 : 0),
    },
  },
  'TK:o2': { setup: (p, v) => (addMaxHp(p, v('deepRootsHp')), field(p, v('deepRootsField'))) },
  'TK:o3': {
    hooks: {
      blockBonus: (state, side) => -num(state, side, 'TK', 'thornBlockLoss'),
      afterHits: (state, side, r) => {
        const n = r.hitsBlocked * num(state, side, 'TK', 'thornDmg')
        if (n <= 0) return
        hurt(state, other(side), n)
        say(state, side, `Thornhide: ${r.hitsBlocked} blocked hits deal ${n} back`)
      },
    },
  },
  'BR:o1': {
    setup: (p, v) => field(p, v('bloodlustField')),
    hooks: { lifesteal: (state, side) => (pctHp(state.players[side]) < num(state, side, 'BR', 'bloodlustHpPct') ? num(state, side, 'BR', 'bloodlustPct') : 0) },
  },
  'BR:o2': { tune: (t, v) => add(t, 'BR', 'start', v('hotBloodRage')), setup: (p, v) => addMaxHp(p, -v('hotBloodHp')) },
  'BR:o3': { tune: (t, v) => add(t, 'BR', 'perHitTaken', -v('ironHideRage')), hooks: { hitCut: (state, side) => num(state, side, 'BR', 'ironHideCut') } },
  'AS:o1': {
    setup: (p, v) => addMaxHp(p, -v('shadowEdgeHp')),
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (bonus.length) bonus[0] += num(state, side, 'AS', 'shadowEdgeDmg')
      },
    },
  },
  'AS:o2': { tune: (t, v) => add(t, 'AS', 'cap', -v('quickdrawCap')), hooks: { startDraw: (t) => (t as Record<string, Record<string, number>>).AS.quickdrawCards ?? 0 } },
  'AS:o3': {
    tune: (t, v) => add(t, 'AS', 'start', Math.min(0, v('vanishEnergy') - t.AS.start)),
    setup: (p, v) => status(p, 'parry', v('vanishParry')),
  },
  'MG:o1': { tune: (t, v) => add(t, 'MG', 'cap', v('overchargeCap')), hooks: { blockBonus: (state, side) => -num(state, side, 'MG', 'overchargeBlockLoss') } },
  'MG:o2': { setup: (p, v) => (status(p, 'shield', v('arcaneWardShield')), cost(p, 0, v('arcaneWardCost'))) },
  'MG:o3': {
    setup: (p, v) => addMaxHp(p, -v('glassFocusHp')),
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = num(state, side, 'MG', 'glassFocusDmg')
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
      },
    },
  },
}

// ---------------- Sigil II · Minor ----------------
const MINOR_FX: Record<string, Piece> = {
  m1: { setup: (p, v) => addMaxHp(p, v('secondBreathHp')) },
  m2: {
    tune: (t, v, champ) => champ !== 'TK' && add(t, champ, 'start', v('headStartRes')),
    setup: (p, v) => p.championId === 'TK' && addMaxHp(p, v('headStartTankHp')),
  },
  m3: {
    hooks: {
      extraChargeDraw: (state, side) => {
        if (!once(state.players[side], 'steady')) return 0
        say(state, side, 'Steady Hands: first Charge draws more')
        return num(state, side, 'MINOR', 'steadyDraw')
      },
    },
  },
  m4: {
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (!bonus.length || pctHp(state.players[side]) >= num(state, side, 'MINOR', 'lastStandHpPct')) return
        bonus[0] += num(state, side, 'MINOR', 'lastStandDmg')
        say(state, side, 'Last Stand: slot 1 dmg up')
      },
    },
  },
}

// ---------------- Ascendancy nodes, by "STYLE:ID" ----------------
/** Built per node: amt(state, side) reads the node's own number in play, k is its key (for tune / setup). */
const NODE_FX: Record<string, (amt: (state: GameState, side: Side) => number, key: string) => Piece> = {
  // ---- Tank v2 (design/tank-ascendancy-v2-2026-10-25.md): 4 branches × (2 nodes + capstone with a Cost) ----
  // Lifeline · Endurance (PoE Juggernaut): stacks kept in perkData, capped, fade after ascEnduranceTurns without a new one
  'TK:1:A1': () => ({
    hooks: {
      afterHits: (state, side, r) => {
        const p = state.players[side]
        if (r.hitsTaken < 2 || p.hp <= 0) return
        const max = num(state, side, 'TK:1', 'ascEnduranceMax')
        const n = Math.min(max, endurance(p) + (p.perks?.includes('asc:TK:1:A3') ? 2 : 1))
        p.perkData = { ...p.perkData, endurance: n, enduranceAt: state.turn }
        say(state, side, `Unflinching: Endurance ${n}/${max}`)
      },
      hitCut: (state, side) => endurance(state.players[side]),
      endTurn: (state, side) => {
        const p = state.players[side]
        if (endurance(p) && state.turn - (p.perkData?.enduranceAt ?? 0) >= num(state, side, 'TK:1', 'ascEnduranceTurns')) {
          p.perkData = { ...p.perkData, endurance: 0 }
          say(state, side, 'Unflinching: Endurance fades')
        }
      },
    },
  }),
  'TK:1:A2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = endurance(state.players[side]) * amt(state, side)
        if (!n) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        say(state, side, `Unyielding: every chain card +${n} dmg`)
      },
    },
  }),
  'TK:1:A3': () => ({
    tune: (t, v) => add(t, 'TK:1', 'ascEnduranceMax', v('ascUnrelenting')),
    hooks: {
      endTurn: (state, side) => {
        const p = state.players[side]
        const n = endurance(p)
        if (!n || p.hp <= 0 || pctHp(p) >= RED_PCT) return
        p.perkData = { ...p.perkData, endurance: 0 }
        const got = styleHeal(state, side, n * num(state, side, 'TK:1', 'ascUnrelentingHeal'))
        say(state, side, `Unrelenting: ${n} Endurance → heals ${got}`)
      },
    },
  }),
  // Lifeline · Untiring
  'TK:1:B1': (_, k) => ({ tune: (t, v) => add(t, 'TK:1', 'hpPct', v(k)) }),
  'TK:1:B2': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (!r.hitsBlocked) return
        const got = styleHeal(state, side, Math.min(num(state, side, 'TK:1', 'ascUntiringCap'), r.hitsBlocked * amt(state, side)))
        if (got) say(state, side, `Untiring: heals ${got}`)
      },
    },
  }),
  'TK:1:B3': () => ({
    setup: (p, v) => addMaxHp(p, -v('ascSecondWindCost')),
    hooks: {
      endTurn: (state, side) => {
        const p = state.players[side]
        if (!p.styleData?.spent || !once(p, 'secondWind')) return
        p.styleData = { ...p.styleData, spent: 0, below: 0 }
        say(state, side, 'Second Wind: Lifeline can switch on once more')
      },
    },
  }),
  // Lifeline · Unstoppable
  'TK:1:C1': (amt) => ({ hooks: { chargeBreakSafe: (state, side) => amt(state, side) } }),
  'TK:1:C2': (amt) => ({
    hooks: {
      blockBonus: (state, side) => (state.players[side].perkData?.chargedTurn === state.turn - 1 ? amt(state, side) : 0),
      endTurn: (state, side, action) => {
        if (action === 'charge') state.players[side].perkData = { ...state.players[side].perkData, chargedTurn: state.turn }
      },
    },
  }),
  'TK:1:C3': (amt) => ({
    setup: (p, v) => cost(p, v('ascUndeniableCost'), 0),
    hooks: {
      beforeHits: (state, side, _b, _m, _c, _chain, pierce) => {
        if (!pierce?.length || amt(state, side) <= 0) return
        for (let i = 0; i < Math.min(amt(state, side), pierce.length); i++) pierce[i] = 1
        say(state, side, 'Undeniable: slot 1 ignores Block')
      },
    },
  }),
  // Lifeline · Unbroken
  'TK:1:D1': (amt) => ({
    hooks: {
      onHpLoss: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || pctHp(p) >= RED_PCT || !once(p, 'bastion')) return
        status(p, 'shield', amt(state, side))
        say(state, side, `Last Bastion: Shield ${amt(state, side)}`)
      },
    },
  }),
  'TK:1:D2': (amt) => ({ hooks: { hitCut: (state, side) => (pctHp(state.players[side]) < RED_PCT ? amt(state, side) : 0) } }),
  'TK:1:D3': (amt) => ({
    setup: (p, v) => addMaxHp(p, -v('ascUnbrokenCost')),
    hooks: {
      onHpLoss: (state, side) => {
        const p = state.players[side]
        if (p.hp > 0 || (p.perkData?.unbroken ?? 0) >= amt(state, side)) return
        p.hp = 1
        p.perkData = { ...p.perkData, unbroken: (p.perkData?.unbroken ?? 0) + 1 }
        say(state, side, 'Unbroken: stays on 1 HP')
      },
    },
  }),

  // Titan Bloom · Bloom (PoE Guardian)
  'TK:2:A1': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'perFacing', v(k)) }),
  'TK:2:A2': (_, k) => ({
    setup: (p, v) => {
      p.maxHp += v(k)
      p.styleData = { ...p.styleData, grown: (p.styleData?.grown ?? 0) + v(k) }
    },
  }),
  'TK:2:A3': (_, k) => ({
    tune: (t, v) => {
      add(t, 'TK:2', 'maxHpCap', v(k))
      add(t, 'TK:2', 'perHitTaken', v('ascAncientHit'))
      add(t, 'TK:2', 'hpPerDmg', 1_000_000) // Cost: no Titan Bloom dmg
    },
  }),
  // Titan Bloom · Bramble
  'TK:2:B1': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'perHitBlocked', v(k)) }),
  'TK:2:B2': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        const n = r.hitsBlocked * amt(state, side)
        if (n <= 0) return
        hurt(state, other(side), n)
        say(state, side, `Thorns: ${r.hitsBlocked} stopped hits deal ${n} back`)
      },
    },
  }),
  'TK:2:B3': (amt) => ({
    tune: (t) => add(t, 'TK:2', 'perHitBlocked', -1_000_000), // Cost: nodes are taken in id order, so this lands after Bark Guard
    hooks: {
      afterHits: (state, side, r) => {
        if (!r.hitsBlocked) return
        const p = state.players[side]
        p.perkData = { ...p.perkData, briar: Math.min(num(state, side, 'TK:2', 'ascBriarWallCap'), r.hitsBlocked) }
      },
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        const hits = p.perkData?.briar ?? 0
        if (!hits) return
        const n = hits * amt(state, side)
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        p.perkData = { ...p.perkData, briar: 0 }
        say(state, side, `Briar Wall: ${hits} stopped hits → every chain card +${n} dmg`)
      },
    },
  }),
  // Titan Bloom · Timber
  'TK:2:C1': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'hpPerDmg', -v(k)) }),
  'TK:2:C2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = Math.min(num(state, side, 'TK:2', 'ascIronbarkCap'), Math.floor((state.players[side].styleData?.grown ?? 0) / Math.max(1, amt(state, side))))
        if (!bonus.length || n <= 0) return
        bonus[0] += n
        say(state, side, `Ironbark Fist: slot 1 +${n} dmg`)
      },
    },
  }),
  'TK:2:C3': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        const grown = p.styleData?.grown ?? 0
        if (bonus.length < num(state, side, 'TK:2', 'ascTimberCards') || grown <= 0) return
        const n = Math.min(num(state, side, 'TK:2', 'ascTimberCap'), Math.floor(grown / Math.max(1, amt(state, side))))
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        p.maxHp = Math.max(1, p.maxHp - grown)
        p.hp = Math.min(p.hp, p.maxHp)
        p.styleData = { ...p.styleData, grown: 0 }
        say(state, side, `🌳 Timber!: ${grown} Max HP felled → every chain card +${n} dmg`)
      },
    },
  }),
  // Titan Bloom · Time of Need
  'TK:2:D1': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'perDebuff', v(k)) }),
  'TK:2:D2': (amt) => ({ hooks: { hitCut: (state, side) => (debuffStacks(state.players[side]) >= 3 ? amt(state, side) : 0) } }),
  'TK:2:D3': (amt) => ({
    tune: (t, v) => add(t, 'TK:2', 'maxHpCap', -v('ascTimeOfNeedCost')),
    hooks: {
      endTurn: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || state.turn % Math.max(1, amt(state, side))) return
        const n = debuffStacks(p)
        p.statuses = p.statuses.filter((s) => !isDebuff(s))
        const heal = num(state, side, 'TK:2', 'ascTimeOfNeedHeal') + Math.floor(((p.maxHp - p.hp) * num(state, side, 'TK:2', 'ascTimeOfNeedPct')) / 100)
        const got = styleHeal(state, side, heal)
        say(state, side, `Time of Need: ${n} debuff stack${n === 1 ? '' : 's'} removed, heals ${got}`)
      },
    },
  }),

  'BR:1:A1': (_, k) => ({ tune: (t, v) => add(t, 'BR:1', 'hpPct', v(k)) }),
  'BR:1:A2': (_, k) => ({ tune: (t, v) => add(t, 'BR:1', 'bonusDmg', v(k)) }),
  'BR:1:A3': (_, k) => ({ tune: (t, v) => add(t, 'BR:1', 'slots', v(k)) }),
  'BR:1:A4': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (!furyOn(state, side) || pctHp(state.players[side]) >= amt(state, side)) return
        const f = tuningOf(state, side)['BR:1']
        for (let i = 0; i < Math.min(f.slots, bonus.length); i++) bonus[i] += f.bonusDmg
        say(state, side, 'Blood Frenzy: Fury counts twice')
      },
    },
  }),
  'BR:1:B1': (_, k) => ({ tune: (t, v) => add(t, 'BR', 'perCleanHit', v(k)) }),
  'BR:1:B2': (amt) => ({ hooks: { lifesteal: (state, side) => (furyOn(state, side) ? amt(state, side) : 0) } }),
  'BR:1:B3': (_, k) => ({ setup: (p, v) => addMaxHp(p, v(k)) }),
  'BR:1:B4': (amt) => ({
    hooks: {
      beforeHits: (state, side, _b, _m, _c, _chain, pierce) => {
        if (!pierce || !furyOn(state, side)) return
        for (let i = 0; i < Math.min(amt(state, side), pierce.length); i++) pierce[i] = 1
        say(state, side, 'Unstoppable: Fury slot 1 ignores Block')
      },
    },
  }),

  'BR:2:A1': (_, k) => ({ setup: (p, v) => (p.comboData = { ...p.comboData, conqueror: v(k) }) }),
  'BR:2:A2': (_, k) => ({ tune: (t, v) => add(t, 'BR:2', 'conquerorMax', v(k)) }),
  'BR:2:A3': (_, k) => ({ tune: (t, v) => add(t, 'BR:2', 'omnivampPct', v(k)) }),
  'BR:2:A4': (_, k) => ({ tune: (t, v) => add(t, 'BR:2', 'tenacityTurns', v(k)) }),
  'BR:2:B1': (_, k) => ({ tune: (t, v) => add(t, 'BR:2', 'blockLoss', -v(k)) }),
  'BR:2:B2': (_, k) => ({ setup: (p, v) => addMaxHp(p, v(k)) }),
  'BR:2:B3': (_, k) => ({ tune: (t, v) => add(t, 'BR:2', 'chargeBreakTakenPct', -v(k)) }),
  'BR:2:B4': (amt) => ({
    hooks: {
      beforeHits: (state, side, _b, _m, _c, _chain, pierce) => {
        const p = state.players[side]
        if (!pierce || (p.comboData?.conqueror ?? 0) < tuningOf(state, side)['BR:2'].conquerorMax) return
        for (let i = 0; i < Math.min(amt(state, side), pierce.length); i++) pierce[i] = 1
        say(state, side, 'Steamroller: slot 1 ignores Block')
      },
    },
  }),

  'AS:1:A1': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'minChain', -v(k)) }),
  'AS:1:A2': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'dmgPerEnergy', v(k)) }),
  'AS:1:A3': (_, k) => ({ tune: (t, v) => add(t, 'AS', 'markBurstPct', v(k)) }),
  'AS:1:A4': (amt) => ({
    hooks: {
      afterChain: (state, side) => {
        const p = state.players[side]
        if (p.styleData?.odTurn !== state.turn) return 0
        // statuses tick at the start of a turn: 2 = it guards next turn's hits
        p.statuses.push({ kind: 'parry', turns: 2, n: amt(state, side) })
        say(state, side, `Afterimage: Parry ${amt(state, side)} next turn`)
        return 0
      },
    },
  }),
  'AS:1:B1': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'dualDraw', v(k)) }),
  'AS:1:B2': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'startDraw', v(k)) }),
  'AS:1:B3': (_, k) => ({ tune: (t, v) => add(t, 'AS', 'cap', v(k)) }),
  'AS:1:B4': (amt) => ({
    hooks: {
      endTurn: (state, side, action, enemyAction) => {
        if (action !== 'strike' || enemyAction !== 'strike' || state.players[side].hp <= 0) return
        state.players[side].statuses.push({ kind: 'blockPlus', turns: 2, n: amt(state, side) })
        say(state, side, `Blur: Block next turn stops ${amt(state, side)} more hits`)
      },
    },
  }),

  'AS:2:A1': (_, k) => ({ setup: (p, v) => (p.styleData = { ...p.styleData, attacks: v(k) }) }),
  'AS:2:A2': (_, k) => ({ tune: (t, v) => add(t, 'AS:2', 'redHpPct', v(k)) }),
  'AS:2:A3': (_, k) => ({ tune: (t, v) => add(t, 'AS:2', 'redCritMult', v(k)) }),
  'AS:2:A4': (_, k) => ({ tune: (t, v) => add(t, 'AS:2', 'blockedCritPct', v(k)) }),
  'AS:2:B1': (_, k) => ({ tune: (t, v) => add(t, 'AS:2', 'blockedCritPct', v(k)) }),
  'AS:2:B2': (amt) => ({
    hooks: {
      beforeHits: (state, side, _b, _m, crit) => {
        if (!crit.size) return
        const got = styleHeal(state, side, amt(state, side) * crit.size)
        if (got) say(state, side, `Siphon: Critical heals ${got}`)
      },
    },
  }),
  'AS:2:B3': (_, k) => ({ setup: (p, v) => addMaxHp(p, v(k)) }),
  'AS:2:B4': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus, _m, crit) => {
        const p = state.players[side]
        if (p.perkData?.shadowMark) {
          for (let i = 0; i < bonus.length; i++) bonus[i] += amt(state, side)
          say(state, side, `Shadow Mark: every chain card +${amt(state, side)} dmg`)
        }
        p.perkData = { ...p.perkData, shadowMark: crit.size ? 1 : 0 }
      },
    },
  }),

  // ---- Mage v2 (design/mage-ascendancy-v2-2026-10-21.md): 4 branches × (2 nodes + capstone with a Cost) ----
  // Pyromancer · Inferno (burst)
  'MG:1:A1': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = igniteStacks(state.players[other(side)]) * amt(state, side)
        if (!n) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        say(state, side, `Flashpoint: every chain card +${n} dmg`)
      },
    },
  }),
  'MG:1:A2': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'igniteMax', v(k)) }),
  'MG:1:A3': (amt) => ({
    tune: (t, v) => add(t, 'MG:1', 'igniteFlat', -v('ascCombustionCost')),
    hooks: {
      afterChain: (state, side) => {
        const combo = state.events?.some((e) => e.k === 'combo' && e.side === side && e.name === 'S + S + S')
        const foe = state.players[other(side)]
        const n = igniteStacks(foe)
        if (!combo || !n) return 0
        foe.statuses = foe.statuses.filter((s) => s.kind !== 'ignite')
        hurt(state, other(side), n * amt(state, side))
        say(state, side, `🔥 Combustion: ${n} Ignite consumed → enemy loses ${n * amt(state, side)} HP`)
        return 0
      },
    },
  }),
  // Pyromancer · Wildfire (attrition)
  'MG:1:B1': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'igniteTurns', v(k)) }),
  'MG:1:B2': (amt) => ({
    hooks: {
      afterChain: (state, side, r) => {
        const stopped = r.chainLength - r.cleanHits
        if (stopped <= 0 || amt(state, side) <= 0) return 0
        const n = addIgnite(state, other(side), stopped * amt(state, side))
        say(state, side, `Fan the Flames: ${stopped} stopped hits → enemy gets 🔥 Ignite (${n} stacks)`)
        return 0
      },
    },
  }),
  'MG:1:B3': (_, k) => ({
    tune: (t, v) => add(t, 'MG:1', 'igniteFlat', v(k)),
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = num(state, side, 'MG:1', 'ascEverburnCost')
        if (n) for (let i = 0; i < bonus.length; i++) bonus[i] -= n
      },
      endTurn: (state, side) => {
        const burn = state.players[other(side)].statuses.find((s) => s.kind === 'ignite')
        if (burn) burn.turns = Math.max(burn.turns, num(state, side, 'MG:1', 'igniteTurns'))
      },
    },
  }),
  // Pyromancer · Molten Core (counter)
  'MG:1:C1': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (!state.players[side].styleData?.molten || !r.hitsBlocked || amt(state, side) <= 0) return
        hurt(state, other(side), r.hitsBlocked * amt(state, side))
        say(state, side, `Backdraft: ${r.hitsBlocked} stopped hits → ${r.hitsBlocked * amt(state, side)} dmg back`)
      },
    },
  }),
  'MG:1:C2': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        const p = state.players[side]
        if (!p.styleData?.molten || !r.attacked || r.hitsTaken > 0 || !state.rules.resources) return
        p.res = Math.min(num(state, side, 'MG', 'cap'), (p.res ?? 0) + amt(state, side))
        say(state, side, `Banked Heat: no dmg taken → +${amt(state, side)} Mana`)
      },
    },
  }),
  'MG:1:C3': (amt) => ({
    tune: (t) => add(t, 'MG:1', 'moltenIgnite', -999),
    hooks: {
      afterHits: (state, side) => {
        const p = state.players[side]
        if (p.styleData?.molten && p.styleData.moltenSpent) p.perkData = { ...p.perkData, eruption: p.styleData.moltenSpent }
      },
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        const mana = p.perkData?.eruption ?? 0
        if (!mana) return
        const n = mana * amt(state, side)
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        p.perkData = { ...p.perkData, eruption: 0 }
        say(state, side, `🌋 Eruption: ${mana} Mana banked → every chain card +${n} dmg`)
      },
    },
  }),
  // Pyromancer · Phoenix (comeback)
  'MG:1:D1': (amt) => ({
    hooks: {
      afterChain: (state, side, r) => {
        if (!r.paidSkills || pctHp(state.players[side]) >= RED_PCT || amt(state, side) <= 0) return 0
        const n = addIgnite(state, other(side), r.paidSkills * amt(state, side))
        say(state, side, `Ember Heart: low HP → enemy gets more 🔥 Ignite (${n} stacks)`)
        return 0
      },
    },
  }),
  'MG:1:D2': (amt) => ({
    hooks: {
      endTurn: (state, side) => {
        const n = igniteStacks(state.players[other(side)]) * amt(state, side)
        if (!n) return
        const got = styleHeal(state, side, n)
        if (got) say(state, side, `Cauterize: heals ${got}`)
      },
    },
  }),
  'MG:1:D3': (amt) => ({
    setup: (p, v) => addMaxHp(p, -v('ascRebirthCost')),
    hooks: {
      onHpLoss: (state, side) => {
        const p = state.players[side]
        if (p.hp > 0 || !once(p, 'rebirth')) return
        p.hp = 1
        const got = styleHeal(state, side, Math.floor((p.maxHp * amt(state, side)) / 100))
        const n = addIgnite(state, other(side), num(state, side, 'MG:1', 'igniteMax'))
        say(state, side, `🔥 Rebirth: rises on 1 HP, heals ${got}, enemy gets 🔥 Ignite (${n} stacks)`)
      },
    },
  }),

  // Cryomancer · Shatter (burst)
  'MG:2:A1': (amt) => ({
    hooks: {
      beforeHits: (state, side, _b, mult) => {
        const pct = chillStacks(state.players[other(side)]) * amt(state, side)
        if (!pct) return
        for (let i = 0; i < mult.length; i++) mult[i] *= 1 + pct / 100
        say(state, side, `Brittle: every chain card +${pct}% dmg`)
      },
    },
  }),
  'MG:2:A2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (!state.players[other(side)].statuses.some((s) => s.kind === 'frozen') || amt(state, side) <= 0) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += amt(state, side)
        say(state, side, `Cold Snap: enemy Frozen → every chain card +${amt(state, side)} dmg`)
      },
    },
  }),
  'MG:2:A3': (_, k) => ({
    tune: (t, v) => {
      add(t, 'MG:2', 'chillMax', -v(k))
      add(t, 'MG:2', 'shatterPct', v('ascShatterpointPct'))
      add(t, 'MG:2', 'frostArmorShield', -v('ascShatterpointCost'))
    },
  }),
  // Cryomancer · Permafrost (control)
  'MG:2:B1': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'chillDmgCut', v(k)) }),
  'MG:2:B2': (amt) => ({
    hooks: {
      afterChain: (state, side) => {
        const foe = state.players[other(side)]
        if (chillStacks(foe) < amt(state, side) || foe.statuses.some((s) => s.kind === 'skillSilence')) return 0
        foe.statuses.push({ kind: 'skillSilence', turns: 1 })
        say(state, side, 'Bitter Wind: enemy Skill card effects are off next turn')
        return 0
      },
    },
  }),
  'MG:2:B3': (_, k) => ({
    tune: (t, v) => {
      add(t, 'MG:2', 'chillNoFreeze', 1)
      add(t, 'MG:2', 'chillMax', v(k) - t['MG:2'].chillMax)
    },
    hooks: {
      endTurn: (state, side) => {
        const chill = state.players[other(side)].statuses.find((s) => s.kind === 'chill')
        if (chill) chill.turns = Math.max(chill.turns, num(state, side, 'MG:2', 'chillTurns'))
      },
    },
  }),
  // Cryomancer · Glacier (Shield as ammo)
  'MG:2:C1': (amt) => ({
    hooks: {
      endTurn: (state, side, action) => {
        const p = state.players[side]
        const n = Math.min(amt(state, side), num(state, side, 'MG:2', 'ascHoarfrostCap') - shieldOf(p))
        if (action !== 'block' || p.hp <= 0 || n <= 0) return
        // one lasting Shield that grows, not a new one per Block
        const lasting = p.statuses.find((s) => s.kind === 'shield' && s.turns > 9000)
        if (lasting) lasting.n = (lasting.n ?? 0) + n
        else status(p, 'shield', n)
        say(state, side, `Hoarfrost: Shield +${n}`)
      },
    },
  }),
  'MG:2:C2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (!bonus.length || shieldOf(state.players[side]) <= 0) return
        bonus[0] += amt(state, side)
        say(state, side, `Ice Lance: slot 1 +${amt(state, side)} dmg`)
      },
    },
  }),
  'MG:2:C3': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        const total = shieldOf(p)
        const n = Math.floor(total / Math.max(1, amt(state, side)))
        if (!bonus.length || !n) return
        p.statuses = p.statuses.filter((s) => s.kind !== 'shield')
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        say(state, side, `🏔 Avalanche: ${total} Shield breaks → every chain card +${n} dmg`)
      },
    },
  }),
  // Cryomancer · Rime Hex (lockdown)
  'MG:2:D1': (amt) => ({
    hooks: {
      endTurn: (state, side) => {
        if (!freshFreeze(state, side, 1)) return
        const foe = state.players[other(side)]
        const lost = foe.hand.splice(0, Math.max(0, amt(state, side)))
        if (!lost.length) return
        foe.deck.push(...lost)
        say(state, side, `Cold Hands: enemy's ${lost.length} oldest Field card${lost.length === 1 ? '' : 's'} → deck bottom`)
      },
    },
  }),
  'MG:2:D2': (amt) => ({
    hooks: {
      afterChain: (state, side) => {
        const foe = state.players[other(side)]
        if (chillStacks(foe) < amt(state, side) || foe.statuses.some((s) => s.kind === 'noCharge')) return 0
        foe.statuses.push({ kind: 'noCharge', turns: 1 })
        say(state, side, 'Frost Lock: enemy can\'t Charge next turn')
        return 0
      },
    },
  }),
  'MG:2:D3': (amt) => ({
    tune: (t, v) => add(t, 'MG:2', 'chillMax', v('ascGlacialPrisonCost')),
    hooks: {
      endTurn: (state, side) => {
        if (!freshFreeze(state, side, 2) || amt(state, side) <= 0) return
        for (const s of state.players[other(side)].statuses) if (s.kind === 'noStrike' || s.kind === 'frozen') s.turns += amt(state, side)
        say(state, side, `Glacial Prison: enemy stays Frozen ${amt(state, side)} more turn`)
      },
    },
  }),
}

// ---------------- registry ----------------

/** Every piece, by perk key: "oath:TK:o1", "minor:m2", "asc:TK:1:A3". group = where its numbers live. */
const PIECES: Record<string, Piece & { group: string }> = {}
for (const [champ, list] of Object.entries(OATHS)) for (const o of list) PIECES[`oath:${champ}:${o.id}`] = { group: champ, ...OATH_FX[`${champ}:${o.id}`] }
for (const m of MINORS) PIECES[`minor:${m.id}`] = { group: 'MINOR', ...MINOR_FX[m.id] }
for (const [style, tree] of Object.entries(TREES))
  for (const n of tree.nodes) {
    const key = n.fields[0]?.key ?? `asc${n.id}`
    const make = NODE_FX[`${style}:${n.id}`]
    if (make) PIECES[`asc:${style}:${n.id}`] = { group: style, ...make((state, side) => num(state, side, style, key), key) }
  }
for (const [k, piece] of Object.entries(PIECES)) if (piece.hooks) PERK_HOOKS[k] = { name: k, ...piece.hooks }

const LETTERS = 'ABCDEFGH'
/** Branch letters and nodes per branch of a Style's tree (no tree: the classic 2 × 4). */
export const treeShape = (style?: string) => {
  const t = style ? TREES[style] : undefined
  return { letters: LETTERS.slice(0, t?.branches.length ?? 2), depth: t?.depth ?? 4 }
}
/** Points a Style's tree gets: game_config asc_points + the tree's own bonus. */
export const treePoints = (style: string | undefined, base: number) => base + ((style && TREES[style]?.bonusPoints) || 0)

/** Can these node ids be taken together in this Style's tree? Top-down per branch, at most `points` of them. */
export function validAsc(ids: string[], points: number, style?: string): boolean {
  if (ids.length > points || new Set(ids).size !== ids.length) return false
  const { letters, depth } = treeShape(style)
  return ids.every((id) => {
    const n = Number(id.slice(1))
    return id.length === 2 && letters.includes(id[0]) && n >= 1 && n <= depth && (n === 1 || ids.includes(`${id[0]}${n - 1}`))
  })
}

/** The perk keys a loadout gives this Champion + Style (unknown or illegal picks are left out). */
export function perkKeys(champ: string, style: string | undefined, l: Loadout | undefined): string[] {
  if (!l) return []
  const out: string[] = []
  if (l.oath && PIECES[`oath:${champ}:${l.oath}`]) out.push(`oath:${champ}:${l.oath}`)
  if (l.minor && PIECES[`minor:${l.minor}`]) out.push(`minor:${l.minor}`)
  // id order (A1 < A2 < A3 < B1 …): a capstone's tune lands after its branch's nodes
  if (style && l.asc && validAsc(l.asc, l.points ?? treePoints(style, 5), style)) for (const id of [...l.asc].sort()) if (PIECES[`asc:${style}:${id}`]) out.push(`asc:${style}:${id}`)
  return out
}

/**
 * createGame: give a freshly made player their loadout. Their own numbers (tune), then start changes (setup);
 * hooks run from PERK_HOOKS during the game. Called before the Style's own setup.
 */
export function applyLoadout(p: PlayerState, l: Loadout | undefined, gameTuning: Tuning) {
  const keys = perkKeys(p.championId, p.style, l)
  if (!keys.length) return
  p.perks = keys
  const t = structuredClone(gameTuning)
  const at = (tun: Tuning, group: string) => (key: string) => (tun as Record<string, Record<string, number>>)[group]?.[key] ?? 0
  // numbers first (read from the game's numbers so pieces don't feed each other), then the start
  for (const k of keys) PIECES[k].tune?.(t, at(gameTuning, PIECES[k].group), p.championId)
  p.tuning = t
  for (const k of keys) PIECES[k].setup?.(p, at(t, PIECES[k].group))
  const res = resourceOf(p.championId, t)
  if (res && !res.payWithHp) p.res = Math.min(res.cap, res.start)
}

/** A random full loadout for the AI: any Oath (no Minor: Sigil II is off, Q 2026-10-25), and all points spent down random branches of its Style's tree. */
export function randomLoadout(champ: string, style: string | undefined, points: number, rand: () => number = Math.random): Loadout {
  const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(rand() * xs.length)]
  const asc: string[] = []
  const pts = treePoints(style, points)
  if (style && TREES[style]) {
    for (let i = 0; i < pts; i++) {
      const next = [...treeShape(style).letters].map((b) => `${b}${asc.filter((x) => x[0] === b).length + 1}`).filter((id) => validAsc([...asc, id], pts, style))
      const id = pick(next)
      if (!id) break
      asc.push(id)
    }
  }
  return { oath: pick(OATHS[champ] ?? [])?.id, asc, points: pts }
}

// Loadout (design/customization-options-2026-10-18.md): Sigil I · Oath + Sigil II · Minor + Ascendancy nodes of the
// picked Style. Content and numbers: loadoutData.ts (numbers tunable in Admin). Here is what each piece does.
// A piece changes this player's own numbers (deltas on their tuning copy), sets them up at the start, and/or hooks
// into the turn like a Style (StyleDef hooks, registered in PERK_HOOKS). Pieces never touch the other player's numbers.
import { MINORS, OATHS, TREES } from './loadoutData'
import { addRes, resourceOf } from './resources'
import { addIgnite, bloom, chillStacks, counterSpin, debuffStacks, endurance, gainEndurance, hooksOf, igniteStacks, isDebuff, PERK_HOOKS, styleHeal, type StyleDef } from './styles'
import { fieldsOf, tuningOf, type Tuning, type TuningGroup } from './tuning'
import type { GameState, PlayerState, Side } from './types'
import { CUT_CAP, cutGuarded, guardAfterCut, other } from './types'

/** What a player brings: Oath id, Minor id, Ascendancy node ids of the Style they play ("A1".."B4"), points they may spend. */
export type Loadout = { oath?: string; minor?: string; asc?: string[]; points?: number }

/** HP line the game draws in red (Arena HP bar). */
export const RED_PCT = 30

type Piece = {
  /** change this player's numbers (t is their own copy) */
  tune?: (t: Tuning, v: (key: string) => number, champ: string) => void
  /** like tune, after every piece's tune (a Cost that must win over other nodes) */
  lastTune?: (t: Tuning, v: (key: string) => number, champ: string) => void
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
/** Fatal Rhythm nodes: remember this turn's Critical count (Style beforeHits runs first, so crit is filled) */
const critSeen: NonNullable<StyleDef['beforeHits']> = (state, side, _b, _m, crit) => {
  const p = state.players[side]
  p.perkData = { ...p.perkData, critTurn: crit.size ? state.turn : 0, critN: crit.size }
}
const addCritCounter = (p: PlayerState, n: number) => {
  if (n <= 0) return
  p.styleData = { ...p.styleData, attacks: (p.styleData?.attacks ?? 0) + n }
}
const addCritCounterOnce = (state: GameState, side: Side, key: string, n: number) => {
  const p = state.players[side]
  if (n <= 0 || p.perkData?.[key] === state.turn) return false
  p.perkData = { ...p.perkData, [key]: state.turn }
  addCritCounter(p, n)
  return true
}
/** what the enemy played this turn, for pieces whose hooks don't get it (actionStart runs first) */
const foeActSeen: NonNullable<StyleDef['actionStart']> = (state, side, _a, enemyAction) => {
  const p = state.players[side]
  p.perkData = { ...p.perkData, foeActTurn: state.turn, foeAct: enemyAction === 'strike' ? 1 : enemyAction === 'charge' ? 2 : enemyAction === 'block' ? 3 : 0 }
}
const foeDid = (state: GameState, side: Side, a: 'strike' | 'charge' | 'block') => {
  const d = state.players[side].perkData
  return d?.foeActTurn === state.turn && d?.foeAct === { strike: 1, charge: 2, block: 3 }[a]
}
const critThisTurn = (state: GameState, side: Side) => state.players[side].perkData?.critTurn === state.turn
/** a card whose effect has a Cut in it (Assassin Cut cards) */
const isCutCard = (spec: unknown) => !!spec && JSON.stringify(spec).includes('"a":"cut"')
/** cards on the enemy's Field now (Cut nodes need a full-ish Field, Q 2026-10-26) */
const foeField = (state: GameState, side: Side) => state.players[other(side)].hand.length
/** Sabotage: Cut the enemy's newest Field cards, within the per-turn Cut cap (like the Cut primitive, no draw) */
function cutNewest(state: GameState, side: Side, n: number, who: string) {
  const foe = state.players[other(side)]
  for (let k = 0; k < n; k++) {
    if ((foe.cutTaken ?? 0) >= CUT_CAP || !foe.hand.length || cutGuarded(state, other(side))) return
    const i = foe.hand.length - 1
    const lost = foe.hand.splice(i, 1)[0]
    foe.cutTaken = (foe.cutTaken ?? 0) + 1
    guardAfterCut(state, other(side), tuningOf(state, side).AS.cutCooldown)
    ;(foe.discarded ??= []).push({ card: lost, slot: i + 1, reason: 'Cut' })
    ;(state.events ??= []).push({ k: 'discard', side: other(side), uid: lost.uid, reason: 'Cut' })
    const to = lost.owner ?? other(side)
    lost.owner = undefined
    state.players[to].deck.push(lost)
    say(state, side, `${who}: Cut → enemy sends ${lost.def.id} to the deck bottom`)
  }
}
/** Juggernaut Momentum Lifesteal is on: at max stacks, or from Insatiable's stacks when this side took it (Bruiser Style 2) */
const momentumLifesteal = (state: GameState, side: Side) => {
  const p = state.players[side]
  const need = p.perks?.includes('asc:BR:2:C3') ? Math.min(num(state, side, 'BR:2', 'ascInsatiable'), num(state, side, 'BR:2', 'conquerorMax')) : num(state, side, 'BR:2', 'conquerorMax')
  return (p.comboData?.conqueror ?? 0) >= need
}
/** Quake (Juggernaut capstone) is guarding this turn */
const quakeOn = (state: GameState, side: Side) => {
  const from = state.players[side].perkData?.quakeFrom
  return !!from && state.turn - from < num(state, side, 'BR:2', 'ascQuakeTurns')
}
/** Fury is on for this Strike (Bruiser Style 1) */
const furyOn = (state: GameState, side: Side) => pctHp(state.players[side]) < num(state, side, 'BR:1', 'hpPct')

// ---------------- Sigil · Oath (no Cost, Q 2026-10-25) ----------------
const OATH_FX: Record<string, Piece> = {
  'TK:o1': {
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
  'TK:o2': { setup: (p, v) => addMaxHp(p, v('deepRootsHp')) },
  'TK:o3': {
    hooks: {
      afterHits: (state, side, r) => {
        const n = r.hitsBlocked * num(state, side, 'TK', 'thornDmg')
        if (n <= 0) return
        hurt(state, other(side), n)
        say(state, side, `Thornhide: ${r.hitsBlocked} blocked hits deal ${n} back`)
      },
    },
  },
  'BR:o1': { hooks: { lifesteal: (state, side) => (pctHp(state.players[side]) < num(state, side, 'BR', 'bloodlustHpPct') ? num(state, side, 'BR', 'bloodlustPct') : 0) } },
  'BR:o2': { tune: (t, v) => add(t, 'BR', 'start', v('hotBloodRage')) },
  'BR:o3': { hooks: { hitCut: (state, side) => num(state, side, 'BR', 'ironHideCut') } },
  'AS:o1': {
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (bonus.length) bonus[0] += num(state, side, 'AS', 'shadowEdgeDmg')
      },
    },
  },
  'AS:o2': { hooks: { startDraw: (t) => (t as Record<string, Record<string, number>>).AS.quickdrawCards ?? 0 } },
  'AS:o3': { setup: (p, v) => status(p, 'parry', v('vanishParry')) },
  'MG:o1': { tune: (t, v) => add(t, 'MG', 'cap', v('overchargeCap')) },
  'MG:o2': { setup: (p, v) => status(p, 'shield', v('arcaneWardShield')) },
  'MG:o3': {
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
  // ---- Tank v3 (Q 2026-10-28, design/tank-rework-v3-lifeline-asc / -titan-bloom): 4 branches × (2 nodes + capstone with a Cost) ----
  // Lifeline · Endurance
  'TK:1:A1': (_, k) => ({
    tune: (t, v) => add(t, 'TK:1', 'endMax', v(k)),
    hooks: {
      afterChain: (state, side, r) => {
        if (r.cleanHits > 0) gainEndurance(state, side, 'clean hit', 'clean')
        return 0
      },
    },
  }),
  'TK:1:A2': (_, k) => ({ setup: (p, v) => void (p.perkData = { ...p.perkData, collectAll: v(k) }) }),
  'TK:1:A3': (_, k) => ({
    setup: (p, v) => {
      p.perkData = { ...p.perkData, spinGuard: v(k) }
      p.fieldMax = Math.min(p.fieldMax ?? Infinity, v('ascWhirlField'))
    },
  }),
  // Lifeline · Masochism
  'TK:1:B1': (_, k) => ({
    tune: (t, v) => add(t, 'TK:1', 'hpPct', v(k)),
    hooks: {
      // every HP loss this turn (hits, S costs, burns), banked until it reaches the step
      endTurn: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0) return
        const lost = (state.events ?? []).reduce((t, e) => t + (e.k === 'hp' && e.side === side && e.delta < 0 ? -e.delta : 0), 0)
        const step = Math.max(1, Math.floor((p.maxHp * num(state, side, 'TK:1', 'ascThickSkullLoss')) / 100))
        const bank = (p.perkData?.skullLost ?? 0) + lost
        p.perkData = { ...p.perkData, skullLost: bank >= step ? bank - step : bank }
        if (bank >= step) gainEndurance(state, side, `lost ${num(state, side, 'TK:1', 'ascThickSkullLoss')}% Max HP`, 'skull')
      },
    },
  }),
  'TK:1:B2': (amt) => {
    // the first lock each turn: pay amt% of current HP and gain 1 Endurance instead
    const shrug = (state: GameState, side: Side, what: string) => {
      const p = state.players[side]
      p.perkData = { ...p.perkData, shrugAt: state.turn }
      const n = Math.floor((p.hp * amt(state, side)) / 100)
      if (n > 0 && p.hp > n) {
        p.hp -= n
        ;(state.events ??= []).push({ k: 'hp', side, delta: -n })
      }
      say(state, side, `Shrug Off: ignores ${what}, pays ${n} HP`)
      gainEndurance(state, side, 'Shrug Off', 'shrug')
    }
    return {
      hooks: {
        chargeBreakSafe: (state, side) => (state.players[side].perkData?.shrugAt === state.turn ? 0 : 5),
        onChargeBreak: (state, side) => {
          if (state.players[side].perkData?.shrugAt !== state.turn) shrug(state, side, 'the Charge break')
        },
        endTurn: (state, side) => {
          const p = state.players[side]
          if (p.hp <= 0 || p.perkData?.shrugAt === state.turn || p.perkData?.selfLockAt === state.turn) return
          const locks = p.statuses.filter((x) => x.kind === 'noCharge' || x.kind === 'noBlock' || x.kind === 'noStrike' || x.kind === 'frozen')
          if (!locks.length) return
          p.statuses = p.statuses.filter((x) => !locks.includes(x))
          shrug(state, side, locks.map((x) => x.kind).join(' + '))
        },
      },
    }
  },
  'TK:1:B3': (amt) => ({
    setup: (p) => void (p.perkData = { ...p.perkData, noShield: 1 }),
    hooks: {
      onHpLoss: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || pctHp(p) >= num(state, side, 'TK:1', 'hpPct') || !once(p, 'bloodied')) return
        p.perkData!.bloodiedUntil = state.turn + Math.max(1, amt(state, side)) - 1
        say(state, side, `Bloodied: ${amt(state, side)} turns of Endurance`)
      },
      endTurn: (state, side) => {
        if ((state.players[side].perkData?.bloodiedUntil ?? 0) >= state.turn) gainEndurance(state, side, 'Bloodied', 'bloodied')
      },
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        if ((p.perkData?.bloodiedUntil ?? 0) < state.turn || !bonus.length) return
        const n = Math.floor(((p.maxHp - p.hp) * 10) / Math.max(1, p.maxHp))
        if (n > 0) bonus[0] += n
      },
    },
  }),
  // Lifeline · Resolve
  'TK:1:C1': (amt) => ({
    hooks: {
      hitCut: (state, side) => amt(state, side),
      hitCutSkip: () => 1,
      hitCutHits: (state, side) => num(state, side, 'TK:1', 'ascSteadyHits'),
      chargeBreakSafe: (state, side) => num(state, side, 'TK:1', 'ascSteadySafe'),
    },
  }),
  'TK:1:C2': (_, k) => ({
    setup: (p, v) => void (p.perkData = { ...p.perkData, overShield: v(k) }),
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = Math.floor(shieldOf(state.players[side]) / 2)
        if (!n || !bonus.length) return
        bonus[0] += n
        say(state, side, `Overflow: slot 1 +${n} dmg (half your Shield)`)
      },
    },
  }),
  'TK:1:C3': (amt) => ({
    setup: (p, v) => {
      const c = (p.costMod ??= { pct: 0, flat: 0 })
      c.addHpPct = (c.addHpPct ?? 0) + v('ascDuelCost')
    },
    hooks: {
      endTurn: (state, side, action, enemyAction) => {
        const p = state.players[side]
        const duel = action === 'strike' && enemyAction === 'strike' ? (p.perkData?.duel ?? 0) + 1 : 0
        p.perkData = { ...p.perkData, duel: duel >= 2 ? 0 : duel, duelReady: duel >= 2 ? 1 : (p.perkData?.duelReady ?? 0) }
      },
      afterChain: (state, side, r) => {
        const p = state.players[side]
        if (!p.perkData?.duelReady || !r.cleanHits || p.hp <= 0) return 0
        const foe = state.players[other(side)]
        const dmg = Math.floor((p.maxHp * amt(state, side)) / 100)
        hurt(state, other(side), dmg)
        const got = styleHeal(state, side, Math.floor((p.maxHp * num(state, side, 'TK:1', 'ascDuelHeal')) / 100))
        const steal = Math.max(0, Math.min(num(state, side, 'TK:1', 'ascDuelSteal'), num(state, side, 'TK:1', 'ascDuelCap') - (p.perkData?.duelStolen ?? 0), foe.maxHp - 1))
        foe.maxHp -= steal
        foe.hp = Math.min(foe.hp, foe.maxHp)
        p.maxHp += steal
        p.perkData = { ...p.perkData, duelReady: 0, duelStolen: (p.perkData?.duelStolen ?? 0) + steal }
        say(state, side, `Duel: +${dmg} dmg, heals ${got}, steals ${steal} Max HP`)
        return 0
      },
    },
  }),
  // Lifeline · Berserker
  'TK:1:D1': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        const streak = p.perkData?.strikeAt === state.turn - 1 ? (p.perkData?.streak ?? 0) + 1 : 1
        p.perkData = { ...p.perkData, streak, strikeAt: state.turn }
        const n = Math.min(num(state, side, 'TK:1', 'ascMomentumCap'), (streak - 1) * amt(state, side))
        if (!n) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        say(state, side, `Momentum: Strike ${streak} in a row, every card +${n} dmg`)
      },
      endTurn: (state, side, _a, enemyAction) => {
        const n = num(state, side, 'TK:1', 'ascMomentumChip')
        if (enemyAction === 'strike' || n <= 0 || state.players[side].hp <= 0 || state.players[other(side)].hp <= 0) return
        hurt(state, other(side), n)
        say(state, side, `Momentum: enemy didn't Strike, loses ${n} HP`)
      },
    },
  }),
  'TK:1:D2': (_, k) => ({
    tune: (t, v) => add(t, 'TK:1', 'spinDmg', v(k)),
    hooks: {
      afterHits: (state, side, r) => {
        if (r.hitsBlocked >= 2) counterSpin(state, side, `Block stopped ${r.hitsBlocked}`)
      },
    },
  }),
  'TK:1:D3': (_, k) => ({
    setup: (p, v) => void (p.perkData = { ...p.perkData, culling: v(k) }),
    hooks: {
      // Style beforeHits (the collect) runs first: if it spent Endurance this turn, pay the Cost
      strikeStart: (state, side) => {
        const p = state.players[side]
        p.perkData = { ...p.perkData, cullFrom: endurance(p) }
      },
      afterChain: (state, side, r) => {
        const p = state.players[side]
        if (p.perkData?.cullFrom) {
          const v = num(state, side, 'TK:1', 'ascCullingVuln')
          if (v > 0) p.statuses.push({ kind: 'vulnerable', turns: 1, n: v })
          p.statuses.push({ kind: 'noBlock', turns: 1 })
          p.perkData = { ...p.perkData, cullFrom: 0, selfLockAt: state.turn }
        }
        const foe = state.players[other(side)]
        if (!r.paidSkills || foe.hp <= 0 || foe.hp >= Math.floor((p.maxHp * num(state, side, 'TK:1', 'ascCullingPct')) / 100)) return 0
        say(state, side, `🪓 Culling Blade: knocks out the enemy at ${foe.hp} HP`)
        hurt(state, other(side), foe.hp)
        return 0
      },
    },
  }),

  // Titan Bloom · Bloom
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
      add(t, 'TK:2', 'treeAt', v('ascAncientCost'))
    },
    hooks: {
      endTurn: (state, side, action) => {
        const p = state.players[side]
        if (action !== 'charge' || p.hp <= 0) return
        const got = styleHeal(state, side, Math.floor(((p.maxHp - p.hp) * num(state, side, 'TK:2', 'ascAncientPct')) / 100))
        if (got) say(state, side, `Ancient: Charge heals ${got}`)
      },
    },
  }),
  // Titan Bloom · Butcher
  'TK:2:B1': (_, k) => ({ setup: (p, v) => void (p.perkData = { ...p.perkData, meatClean: v(k) }) }),
  'TK:2:B2': (amt) => ({
    hooks: {
      afterChain: (state, side, r) => {
        const p = state.players[side]
        if (p.perkData?.brand && r.cleanHits && p.hp > 0) {
          const got = styleHeal(state, side, Math.floor((r.cleanHits * (p.styleData?.grown ?? 0) * amt(state, side)) / 100))
          if (got) say(state, side, `Butcher's Brand: ${r.cleanHits} clean hits on the branded enemy heal ${got}`)
        }
        p.perkData = { ...p.perkData, brand: r.cleanHits > 0 ? 1 : 0 }
        return 0
      },
    },
  }),
  'TK:2:B3': (amt) => ({
    tune: (t) => add(t, 'TK:2', 'cardHealPct', -100),
    hooks: {
      afterChain: (state, side, r) => {
        const p = state.players[side]
        const foe = state.players[other(side)]
        const n = Math.max(0, Math.min(r.cleanHits * amt(state, side), num(state, side, 'TK:2', 'ascCarveCap') - (p.perkData?.carved ?? 0), foe.maxHp - 1))
        if (!n) return 0
        foe.maxHp -= n
        foe.hp = Math.min(foe.hp, foe.maxHp)
        p.perkData = { ...p.perkData, carved: (p.perkData?.carved ?? 0) + n }
        const got = bloom(state, side, n, false)
        say(state, side, `Carve: steals ${n} Max HP${got < n ? ` (grows ${got})` : ''}`)
        return 0
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
  'TK:2:C3': (_, k) => ({
    // set from the game's numbers (v reads them), so Ancient's Cost still adds on top
    tune: (t, v) => {
      add(t, 'TK:2', 'treeAt', v(k) - v('treeAt'))
      add(t, 'TK:2', 'throwCost', v('ascTreeGrabCost') - v('throwCost'))
      add(t, 'TK:2', 'throwDmg', v('ascTreeGrabDmg') - v('throwDmg'))
    },
    setup: (p, v) => {
      p.fieldMax = Math.min(p.fieldMax ?? Infinity, v('ascTreeGrabField'))
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
        const got = styleHeal(state, side, Math.floor(((p.maxHp - p.hp) * num(state, side, 'TK:2', 'ascTimeOfNeedPct')) / 100))
        say(state, side, `Time of Need: ${n} debuff stack${n === 1 ? '' : 's'} removed, heals ${got}`)
      },
    },
  }),

  // ---- Bruiser v2 (design/bruiser-ascendancy-v2-2026-10-25.md): 4 branches × (2 nodes + capstone with a Cost) ----
  // Fury · Carnage (PoE Berserker: more dmg, more dmg taken)
  'BR:1:A1': (_, k) => ({
    tune: (t, v) => add(t, 'BR:1', 'hpPct', v(k)),
    hooks: {
      endTurn: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || p.perkData?.furyOnce || !furyOn(state, side)) return
        p.perkData = { ...p.perkData, furyOnce: 1 }
        addRes(state, side, num(state, side, 'BR:1', 'ascShortFuseRage'))
        say(state, side, `Short Fuse: Fury on, Rage ${p.res}`)
      },
    },
  }),
  'BR:1:A2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = furyOn(state, side) ? num(state, side, 'BR:1', 'ascHeavyHandsFury') : amt(state, side)
        if (!bonus.length || n <= 0) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        say(state, side, `Heavy Hands: every chain card +${n} dmg`)
      },
    },
  }),
  'BR:1:A3': (amt) => ({
    tune: (t) => add(t, 'BR:1', 'slots', 5),
    // Cost: a negative cut adds dmg to every hit that gets past Block
    hooks: { hitCut: (state, side) => (furyOn(state, side) ? -amt(state, side) : 0) },
  }),
  // Fury · Blood Rite (PoE Berserker Rage)
  // Seething: Bruiser's HP-cost cards feed Rage too
  'BR:1:B1': (_, k) => ({
    tune: (t, v) => {
      add(t, 'BR', 'perHitTaken', v(k))
      add(t, 'BR', 'perSelfDmg', v(k))
      add(t, 'BR', 'perCleanHit', v(k))
    },
  }),
  'BR:1:B2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        const n = Math.min(num(state, side, 'BR:1', 'ascWarCryCap'), Math.floor((state.players[side].res ?? 0) / Math.max(1, amt(state, side))))
        if (!bonus.length || n <= 0) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        say(state, side, `War Cry: every chain card +${n} dmg`)
      },
    },
  }),
  'BR:1:B3': (_, k) => ({
    tune: (t, v) => {
      add(t, 'BR', 'cap', v(k))
      add(t, 'BR', 'quietLoss', -1_000_000)
    },
    // Cost: Block, not HP (an HP burn stacked with Bruiser's own HP-cost cards, sim 2026-10-25)
    hooks: { blockBonus: (state, side) => -num(state, side, 'BR:1', 'ascBloodRiteCost') },
  }),
  // Fury · Payback (LoL Sett: left-right punches, stored grit let out in one punch; uses the Rage you already have)
  'BR:1:C1': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus, _m, _c, chain) => {
        let ps = 0
        let hits = 0
        chain?.forEach((card, i) => {
          if (card.def.type !== 'P' || ++ps % 2) return
          bonus[i] += amt(state, side)
          hits++
        })
        if (hits) say(state, side, `One-Two: ${hits} right hook${hits === 1 ? '' : 's'} +${amt(state, side)} dmg`)
      },
    },
  }),
  'BR:1:C2': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        const p = state.players[side]
        p.perkData = { ...p.perkData, hitTurn: r.hitsTaken ? state.turn : 0 }
      },
      // after this turn's Rage is in, so Rage from being hit counts
      endTurn: (state, side, action) => {
        const p = state.players[side]
        // Wound Up lasts until the end of the next turn
        p.statuses = p.statuses.filter((s) => s.kind !== 'woundUp')
        if (action !== 'charge' || p.hp <= 0) return
        if (p.perkData?.hitTurn === state.turn) {
          addRes(state, side, num(state, side, 'BR:1', 'ascFlinchRage'))
          say(state, side, `Wind Up interrupted: Rage ${p.res}`)
        } else if ((p.res ?? 0) > 0) {
          p.statuses.push({ kind: 'woundUp', turns: 9999 })
          say(state, side, '🥊 Wound Up: next Strike is a Payback')
        }
      },
      // S cards were paid before this, so Payback gets the Rage left
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        if (!bonus.length || !p.statuses.some((s) => s.kind === 'woundUp')) return
        p.statuses = p.statuses.filter((s) => s.kind !== 'woundUp')
        const spent = p.res ?? 0
        p.res = 0
        const n = spent * amt(state, side)
        bonus[0] += n
        p.perkData = { ...p.perkData, paybackTurn: state.turn, paybackRage: spent }
        say(state, side, `🥊 Payback: ${spent} Rage → slot 1 +${n} dmg`)
      },
    },
  }),
  'BR:1:C3': (amt) => ({
    tune: (t, v) => add(t, 'BR:1', 'bonusDmg', -v('ascKnockoutCost')),
    hooks: {
      beforeHits: (state, side, _b, _m, _c, _chain, pierce) => {
        const p = state.players[side]
        if (p.perkData?.paybackTurn !== state.turn || !pierce?.length) return
        pierce[0] = 1
        const n = Math.floor(((p.perkData?.paybackRage ?? 0) * amt(state, side)) / 100)
        if (n > 0) p.statuses.push({ kind: 'shield', turns: 1, n })
        say(state, side, `Knockout: Payback ignores Block${n > 0 ? `, Shield ${n}` : ''}`)
      },
    },
  }),
  // Fury · Comeback (Precision ideas: lifesteal, more dmg when behind, heal on a big hit)
  'BR:1:D1': (amt) => ({ hooks: { lifesteal: (state, side) => (furyOn(state, side) ? amt(state, side) : 0) } }),
  'BR:1:D2': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (state.players[other(side)].hp <= state.players[side].hp) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += amt(state, side)
        say(state, side, `Underdog: every chain card +${amt(state, side)} dmg`)
      },
    },
  }),
  'BR:1:D3': (amt) => ({
    // Cost is Max HP, not the Fury line: a smaller Fury window would fight Bloodletting in the same branch (sim 2026-10-25)
    setup: (p, v) => addMaxHp(p, -v('ascRallyCost')),
    hooks: {
      strikeStart: (state, side) => {
        state.players[side].perkData = { ...state.players[side].perkData, foeHpAt: state.players[other(side)].hp }
      },
      afterChain: (state, side) => {
        const p = state.players[side]
        const foe = state.players[other(side)]
        const lost = (p.perkData?.foeHpAt ?? foe.hp) - foe.hp
        if (lost * 100 < amt(state, side) * foe.maxHp) return 0
        const heal = num(state, side, 'BR:1', 'ascRallyHeal') + Math.floor(((p.maxHp - p.hp) * num(state, side, 'BR:1', 'ascRallyPct')) / 100)
        const got = styleHeal(state, side, heal)
        if (got) say(state, side, `Rally: ${lost} dmg dealt, heals ${got}`)
        return 0
      },
    },
  }),

  // Juggernaut · Arena (PoE Gladiator: Block and retaliate)
  'BR:2:A1': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (r.attacked && r.hitsBlocked + r.hitsTaken > 0) state.players[side].perkData = { ...state.players[side].perkData, takeHit: 1 }
      },
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        if (!p.perkData?.takeHit || !bonus.length) return
        bonus[0] += amt(state, side)
        p.perkData = { ...p.perkData, takeHit: 0 }
        say(state, side, `Take the Hit: slot 1 +${amt(state, side)} dmg`)
      },
    },
  }),
  'BR:2:A2': (amt) => ({
    tune: (t, v) => add(t, 'BR:2', 'blockLoss', -v('ascUnshaken')),
    hooks: {
      afterHits: (state, side, r) => {
        if (r.attacked && r.hitsBlocked && !r.hitsTaken) state.players[side].perkData = { ...state.players[side].perkData, riposte: 1 }
      },
      beforeHits: (state, side, bonus) => {
        const p = state.players[side]
        if (!p.perkData?.riposte || !bonus.length) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += amt(state, side)
        p.perkData = { ...p.perkData, riposte: 0 }
        say(state, side, `Riposte: every chain card +${amt(state, side)} dmg`)
      },
    },
  }),
  'BR:2:A3': (amt) => ({
    tune: (t, v) => add(t, 'BR:2', 'omnivampPct', -v('ascRetaliationCost')),
    hooks: {
      afterHits: (state, side, r) => {
        const p = state.players[side]
        const max = tuningOf(state, side)['BR:2'].conquerorMax
        const was = p.comboData?.conqueror ?? 0
        const n = Math.min(max, was + Math.min(amt(state, side), r.hitsBlocked))
        if (n === was) return
        p.comboData = { ...p.comboData, conqueror: n }
        say(state, side, `Retaliation: Momentum ${n}/${max}`)
      },
      // Sunder: the longer you hold the Arena (Momentum), the more of the enemy's Shield you take
      strikeStart: (state, side) => {
        const p = state.players[side]
        const foe = state.players[other(side)]
        let want = Math.min(num(state, side, 'BR:2', 'ascSunderCap'), (p.comboData?.conqueror ?? 0) * num(state, side, 'BR:2', 'ascSunder'))
        let took = 0
        for (const st of foe.statuses) {
          if (want <= 0) break
          if (st.kind !== 'shield' || !(st.n ?? 0)) continue
          const n = Math.min(want, st.n ?? 0)
          st.n = (st.n ?? 0) - n
          want -= n
          took += n
        }
        if (!took) return
        foe.statuses = foe.statuses.filter((st) => st.kind !== 'shield' || (st.n ?? 0) > 0)
        p.statuses.push({ kind: 'shield', turns: 1, n: took })
        say(state, side, `Sunder: took ${took} Shield`)
      },
    },
  }),
  // Juggernaut · Verdict (PoE Slayer: finish them)
  'BR:2:B1': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus) => {
        if (pctHp(state.players[other(side)]) > RED_PCT) return
        for (let i = 0; i < bonus.length; i++) bonus[i] += amt(state, side)
        say(state, side, `Cleave: every chain card +${amt(state, side)} dmg`)
      },
    },
  }),
  'BR:2:B2': (amt) => ({
    hooks: {
      strikeStart: (state, side) => {
        state.players[side].perkData = { ...state.players[side].perkData, foeRedAt: pctHp(state.players[other(side)]) <= RED_PCT ? 1 : 0 }
      },
      afterChain: (state, side) => {
        const p = state.players[side]
        const foe = state.players[other(side)]
        if (p.perkData?.foeRedAt || foe.hp <= 0 || pctHp(foe) > RED_PCT || !once(p, 'bloodhound')) return 0
        const max = tuningOf(state, side)['BR:2'].conquerorMax
        const n = Math.min(max, (p.comboData?.conqueror ?? 0) + amt(state, side))
        p.comboData = { ...p.comboData, conqueror: n }
        say(state, side, `Bloodhound: enemy in the red, Momentum ${n}/${max}`)
        return 0
      },
    },
  }),
  'BR:2:B3': (amt) => ({
    tune: (t, v) => add(t, 'BR:2', 'conquerorMax', v('ascVerdictCost')),
    hooks: {
      afterChain: (state, side) => {
        const p = state.players[side]
        const foe = state.players[other(side)]
        if ((p.comboData?.conqueror ?? 0) < tuningOf(state, side)['BR:2'].conquerorMax) return 0
        if (foe.hp <= 0 || foe.hp * 100 > amt(state, side) * foe.maxHp) return 0
        const before = foe.hp
        foe.hp = 0
        ;(state.events ??= []).push({ k: 'hp', side: other(side), delta: -before })
        for (const h of hooksOf(foe)) h.onHpLoss?.(state, other(side))
        say(state, side, `⚖ Final Verdict: enemy at ${before} HP is finished`)
        return 0
      },
    },
  }),
  // Juggernaut · Hunger (PoE Slayer: Leech)
  'BR:2:C1': (_, k) => ({ tune: (t, v) => add(t, 'BR:2', 'omnivampPct', v(k)) }),
  'BR:2:C2': (amt) => ({ hooks: { hitCut: (state, side) => (momentumLifesteal(state, side) ? amt(state, side) : 0) } }),
  'BR:2:C3': (amt) => ({
    setup: (p, v) => addMaxHp(p, -v('ascInsatiableCost')),
    hooks: {
      // only below max: at max the Style's own Lifesteal is on
      lifesteal: (state, side) => {
        const n = state.players[side].comboData?.conqueror ?? 0
        const f = tuningOf(state, side)['BR:2']
        return n >= amt(state, side) && n < f.conquerorMax ? f.omnivampPct : 0
      },
    },
  }),
  // Juggernaut · Bulwark (Resolve ideas: plating, a regular heal that grows Max HP, a shockwave at full power)
  'BR:2:D1': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (r.hitsTaken) state.players[side].perkData = { ...state.players[side].perkData, platingTurn: state.turn + 1 }
      },
      hitCut: (state, side) => (state.players[side].perkData?.platingTurn === state.turn ? amt(state, side) : 0),
    },
  }),
  'BR:2:D2': (amt) => ({
    hooks: {
      afterChain: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || state.turn - (p.perkData?.gripAt ?? 0) < amt(state, side)) return 0
        const grown = p.perkData?.gripHp ?? 0
        const add = Math.max(0, Math.min(num(state, side, 'BR:2', 'ascIronGripHp'), num(state, side, 'BR:2', 'ascIronGripCap') - grown))
        p.maxHp += add
        p.perkData = { ...p.perkData, gripAt: state.turn, gripHp: grown + add }
        const got = styleHeal(state, side, num(state, side, 'BR:2', 'ascIronGripHeal'))
        say(state, side, `Iron Grip: heals ${got}${add ? `, Max HP +${add}` : ''}`)
        return 0
      },
    },
  }),
  'BR:2:D3': (amt) => ({
    tune: (t) => add(t, 'BR:2', 'tenacityTurns', -1_000_000),
    hooks: {
      // after the Style's strikeStart, which marks the turn Momentum hit max
      strikeStart: (state, side) => {
        const p = state.players[side]
        if (p.styleData?.tenacityFrom === state.turn) {
          p.perkData = { ...p.perkData, quakeFrom: state.turn }
          say(state, side, `Quake: hits deal ${amt(state, side)} less for ${num(state, side, 'BR:2', 'ascQuakeTurns')} turns`)
        }
      },
      hitCut: (state, side) => (quakeOn(state, side) ? amt(state, side) : 0),
      endTurn: (state, side) => {
        const p = state.players[side]
        const from = p.perkData?.quakeFrom
        if (!from || state.turn - from !== num(state, side, 'BR:2', 'ascQuakeTurns') - 1 || p.hp <= 0) return
        const n = num(state, side, 'BR:2', 'ascQuakeDmg')
        hurt(state, other(side), n)
        say(state, side, `Quake: the enemy loses ${n} HP`)
      },
    },
  }),

  // ---- Assassin v2 (design/assassin-ascendancy-v2-2026-10-25.md): 4 branches × (2 nodes + capstone with a Cost) ----
  // Sonic Bliz · Overdrive
  'AS:1:A1': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'dmgPerEnergy', v(k)) }),
  'AS:1:A2': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'minChain', -v(k)) }),
  'AS:1:A3': (amt) => ({
    hooks: {
      actionStart: foeActSeen,
      beforeHits: (state, side, bonus, mult, _c, chain) => {
        const p = state.players[side]
        if (p.styleData?.odTurn !== state.turn || !chain?.length) return
        // strongest chain card after Overdrive and every other boost so far
        const best = Math.max(...chain.map((c, i) => Math.max(0, (c.def.dmg ?? 0) + (bonus[i] ?? 0)) * (mult[i] ?? 1)))
        p.perkData = { ...p.perkData, echo: Math.floor((best * amt(state, side)) / 100), echoTurn: state.turn }
      },
      afterChain: (state, side) => {
        const p = state.players[side]
        if (p.perkData?.echoTurn !== state.turn) return 0
        const n = p.perkData?.echo ?? 0
        if (foeDid(state, side, 'block')) {
          say(state, side, 'Echo: Blocked')
          return 0
        }
        if (n <= 0 || state.players[other(side)].hp <= 0) return 0
        hurt(state, other(side), n)
        say(state, side, `Echo: replays the strongest card for ${n} dmg`)
        return 1
      },
      endTurn: (state, side) => {
        const p = state.players[side]
        const n = num(state, side, 'AS:1', 'ascEchoCost')
        if (p.perkData?.echoTurn !== state.turn || n <= 0 || !(p.res ?? 0)) return
        p.res = Math.max(0, (p.res ?? 0) - n)
        say(state, side, `Echo: loses ${n} Energy`)
      },
    },
  }),
  // Sonic Bliz · Acceleration
  'AS:1:B1': (_, k) => ({ tune: (t, v) => add(t, 'AS:1', 'dualDraw', v(k)) }),
  'AS:1:B2': (amt) => ({
    hooks: {
      actionStart: (state, side, action, enemyAction) => {
        state.players[side].perkData = { ...state.players[side].perkData, slip: action === 'strike' && enemyAction === 'strike' ? state.turn : 0 }
      },
      hitCut: (state, side) => (state.players[side].perkData?.slip === state.turn ? amt(state, side) : 0),
    },
  }),
  'AS:1:B3': (_, k) => ({
    tune: (t, v) => add(t, 'AS:1', 'startDraw', -v(k)),
    hooks: { dualOnCharge: (state, side) => num(state, side, 'AS:1', 'ascMachDraw') },
  }),
  // Sonic Bliz · Shadowstep (PoE Trickster)
  'AS:1:C1': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (!r.attacked || r.hitsTaken > 0 || !r.hitsBlocked || amt(state, side) <= 0) return
        addRes(state, side, amt(state, side))
        say(state, side, `Escape Artist: +${amt(state, side)} Energy`)
      },
    },
  }),
  'AS:1:C2': (amt) => ({
    hooks: {
      hitCut: (state, side) => (state.players[side].perkData?.veil ?? 0) * amt(state, side),
      afterHits: (state, side, r) => {
        const p = state.players[side]
        const had = p.perkData?.veil ?? 0
        const n = r.hitsTaken > 0 ? 0 : Math.min(num(state, side, 'AS:1', 'ascVeilMax'), had + 1)
        if (n === had) return
        p.perkData = { ...p.perkData, veil: n }
        say(state, side, n ? `Ghost Veil: Veil ${n}` : 'Ghost Veil: Veil is gone')
      },
    },
  }),
  'AS:1:C3': (amt) => ({
    setup: (p, v) => addMaxHp(p, -v('ascPhantomCost')),
    hooks: {
      afterHits: (state, side, r) => {
        const p = state.players[side]
        if (!r.attacked || r.hitsTaken > 0 || p.perkData?.phantom) return
        p.perkData = { ...p.perkData, phantom: 1 }
        say(state, side, "Phantom: next Strike's first card can't be Blocked")
      },
      beforeHits: (state, side, _b, _m, _c, _chain, pierce) => {
        const p = state.players[side]
        if (!p.perkData?.phantom || !pierce?.length) return
        for (let i = 0; i < Math.min(amt(state, side), pierce.length); i++) pierce[i] = 1
        p.perkData = { ...p.perkData, phantom: 0 }
        say(state, side, "Phantom: the first card can't be Blocked")
      },
    },
  }),
  // Sonic Bliz · Sabotage (PoE Saboteur): free Cuts on turns nobody Strikes
  'AS:1:D1': (amt) => ({
    hooks: {
      endTurn: (state, side, action, enemyAction) => {
        if (action === 'charge' && enemyAction === 'block' && foeField(state, side) >= num(state, side, 'AS:1', 'ascSnareField')) cutNewest(state, side, amt(state, side), 'Snare')
      },
    },
  }),
  'AS:1:D2': (amt) => ({
    hooks: {
      endTurn: (state, side, action, enemyAction) => {
        if (action === 'block' && enemyAction === 'charge' && foeField(state, side) >= num(state, side, 'AS:1', 'ascTripwireField')) cutNewest(state, side, amt(state, side), 'Tripwire')
      },
    },
  }),
  'AS:1:D3': (amt) => ({
    hooks: {
      cutMore: (state, side) => (foeField(state, side) >= num(state, side, 'AS:1', 'ascDemolitionField') ? amt(state, side) : 0),
      beforeHits: (state, side, bonus, _m, _c, chain) => {
        const n = num(state, side, 'AS:1', 'ascDemolitionCost')
        chain?.forEach((c, i) => {
          if (n > 0 && i < bonus.length && isCutCard(c.def.effectSpec)) bonus[i] -= n
        })
      },
    },
  }),

  // Fatal Rhythm · Execution
  'AS:2:A1': (_, k) => ({
    tune: (t, v) => add(t, 'AS:2', 'redHpPct', v(k)),
    hooks: {
      beforeHits: (state, side, bonus) => {
        const foe = state.players[other(side)]
        const f = tuningOf(state, side)['AS:2']
        if (foe.hp * 100 >= foe.maxHp * f.redHpPct) return
        const n = num(state, side, 'AS:2', 'ascBloodScentDmg')
        for (let i = 0; i < bonus.length; i++) bonus[i] += n
        if (n > 0) say(state, side, `Blood Scent: Low HP enemy → every card +${n} dmg`)
      },
    },
  }),
  'AS:2:A2': (_, k) => ({
    tune: (t, v) => {
      add(t, 'AS:2', 'redHpPct', v(k))
      add(t, 'AS:2', 'redCritMult', v('ascMerciless'))
    },
  }),
  'AS:2:A3': (amt) => ({
    hooks: {
      beforeHits: (state, side, bonus, mult, crit) => {
        critSeen(state, side, bonus, mult, crit)
        const cut = num(state, side, 'AS:2', 'ascExecutionerNonCrit')
        if (cut >= 100) {
          for (let i = 0; i < mult.length; i++) if (!crit.has(i)) mult[i] = 0
          return
        }
        if (cut <= 0) return
        for (let i = 0; i < mult.length; i++) if (!crit.has(i)) mult[i] *= (100 - cut) / 100
      },
      afterChain: (state, side) => {
        const foe = state.players[other(side)]
        if (!critThisTurn(state, side) || foe.hp <= 0 || foe.hp * 100 > foe.maxHp * amt(state, side)) return 0
        hurt(state, other(side), foe.hp)
        say(state, side, 'Executioner: the Critical finishes the enemy')
        return 0
      },
    },
  }),
  // Fatal Rhythm · Crescendo
  'AS:2:B1': (_, k) => ({
    setup: (p, v) => (p.styleData = { ...p.styleData, attacks: v(k) }),
    hooks: {
      actionStart: (state, side, action) => {
        if (action !== 'charge') return
        const n = num(state, side, 'AS:2', 'ascPrimedCharge')
        if (addCritCounterOnce(state, side, 'primedChargeTurn', n)) say(state, side, `Primed: Charge Critical counter +${n}`)
      },
    },
  }),
  'AS:2:B2': (amt) => ({
    hooks: {
      beforeHits: critSeen,
      afterHits: (state, side, r) => {
        const stopped = Math.min(amt(state, side), r.hitsBlocked + r.hitsParried)
        if (stopped > 0) {
          addCritCounter(state.players[side], stopped)
          say(state, side, `Off-Beat: Critical counter +${stopped}`)
        }
        if (!critThisTurn(state, side)) return
        const reset = num(state, side, 'AS:2', 'ascOffBeatReset')
        state.players[side].styleData = { ...state.players[side].styleData, attacks: reset }
        say(state, side, `Off-Beat: next Critical cycle starts at ${reset}`)
      },
    },
  }),
  'AS:2:B3': (amt) => ({
    hooks: {
      beforeHits: (state, side, _b, mult, crit) => {
        const had = state.players[side].perkData?.buildUp ?? 0
        if (had <= 0) return
        for (const i of crit) if (i < mult.length) mult[i] += had
      },
      afterChain: (state, side, r) => {
        const p = state.players[side]
        const had = p.perkData?.buildUp ?? 0
        let next = had
        const lost = r.criticalBlocked * num(state, side, 'AS:2', 'ascBuildUpBlockedLoss')
        if (lost > 0) {
          next = Math.max(0, next - lost)
          p.perkData = { ...p.perkData, skipCritCounter: Math.max(p.perkData?.skipCritCounter ?? 0, 1) }
          say(state, side, `Build-up: Blocked Critical loses ${lost} stack${lost === 1 ? '' : 's'} and skips the next counter`)
        }
        if (r.criticalClean > 0) next = Math.min(num(state, side, 'AS:2', 'ascBuildUpMax'), next + amt(state, side) * r.criticalClean)
        if (r.criticalClean > 0) say(state, side, `Build-up: ${r.criticalClean} successful Critical → ${next}`)
        p.perkData = { ...p.perkData, buildUp: next }
        return 0
      },
      afterHits: (state, side, r) => {
        const p = state.players[side]
        if (r.hitsTaken <= 0 || !p.perkData?.buildUp) return
        p.perkData = { ...p.perkData, buildUp: 0 }
        say(state, side, 'Build-up: reset (clean hit received)')
      },
    },
  }),
  // Fatal Rhythm · Pursuit
  'AS:2:C1': (amt) => ({
    hooks: {
      actionStart: (state, side, action, enemyAction) => {
        if (action !== 'strike' || enemyAction !== 'charge') return
        state.players[side].perkData = { ...state.players[side].perkData, runDownTurn: state.turn }
        if (addCritCounterOnce(state, side, 'runDownCounterTurn', amt(state, side))) say(state, side, `Run Down: Critical counter +${amt(state, side)}`)
      },
      beforeHits: (state, side, bonus) => {
        if (state.players[side].perkData?.runDownTurn !== state.turn || !bonus.length) return
        const n = num(state, side, 'AS:2', 'ascRunDownDmg')
        bonus[0] += n
        if (n > 0) say(state, side, `Run Down: first card +${n} dmg`)
      },
    },
  }),
  'AS:2:C2': (amt) => ({
    hooks: {
      beforeHits: critSeen,
      endTurn: (state, side, action, enemyAction) => {
        if (action !== 'strike' || !critThisTurn(state, side) || amt(state, side) <= 0) return
        if (enemyAction === 'charge' || foeField(state, side) >= num(state, side, 'AS:2', 'ascChaseField')) cutNewest(state, side, amt(state, side), 'Chase')
      },
    },
  }),
  'AS:2:C3': (amt) => ({
    lastTune: (t, v) => {
      t['AS:2'].blockedCritPct = Math.min(t['AS:2'].blockedCritPct, v('ascHuntBlockedPct'))
    },
    hooks: {
      actionStart: foeActSeen,
      beforeHits: (state, side, _b, mult, crit, _chain, _pierce, _piercePct, enemyChain) => {
        if (!crit.size || amt(state, side) <= 0) return
        const charge = foeDid(state, side, 'charge')
        let n = 0
        for (const i of crit) {
          if (charge || i >= (enemyChain?.length ?? 0)) {
            if (i < mult.length) mult[i] += amt(state, side)
            n++
          }
        }
        if (n > 0) say(state, side, `Hunt: ${n} Critical${n === 1 ? '' : 's'} ×${amt(state, side)} more`)
      },
    },
  }),
  // Fatal Rhythm · Shadow
  'AS:2:D1': (_, k) => ({
    tune: (t, v) => add(t, 'AS:2', 'blockedCritPct', v(k)),
    hooks: {
      actionStart: foeActSeen,
      beforeHits: (state, side, _b, _m, crit, _chain, _pierce, piercePct) => {
        if (!foeDid(state, side, 'block') || !piercePct?.length || !crit.size) return
        const n = num(state, side, 'AS:2', 'ascFeintPierce')
        for (const i of crit) if (i < piercePct.length) piercePct[i] = Math.max(piercePct[i], n)
        if (n > 0) say(state, side, `Feint: Blocked Criticals Pierce ${n}% of total dmg`)
      },
    },
  }),
  'AS:2:D2': (amt) => ({
    hooks: {
      beforeHits: critSeen,
      afterChain: (state, side) => {
        if (!critThisTurn(state, side) || amt(state, side) <= 0) return 0
        const p = state.players[side]
        const parry = p.statuses.find((s) => s.kind === 'parry')
        if (parry) {
          parry.n = Math.max(parry.n ?? 0, amt(state, side))
          parry.turns = Math.max(parry.turns, 2)
        } else p.statuses.push({ kind: 'parry', turns: 2, n: amt(state, side) })
        say(state, side, `Ghost Dance: Parry ${amt(state, side)} next turn`)
        return 0
      },
      afterHits: (state, side, r) => {
        const n = r.hitsParried * num(state, side, 'AS:2', 'ascGhostDanceCounter')
        if (n <= 0) return
        addCritCounter(state.players[side], n)
        say(state, side, `Ghost Dance: Parry adds ${n} to the Critical counter`)
      },
    },
  }),
  'AS:2:D3': (amt) => ({
    hooks: {
      beforeHits: (state, side, _b, _m, crit, _chain, pierce) => {
        const p = state.players[side]
        const marked = (p.perkData?.markAt ?? 0) > 0 && (p.perkData?.markAt ?? 0) < state.turn
        if (marked && pierce?.length) {
          for (let i = 0; i < Math.min(amt(state, side), pierce.length); i++) pierce[i] = 1
          const foe = state.players[other(side)]
          foe.statuses = foe.statuses.filter((x) => x.kind !== 'parry' && x.kind !== 'shield')
          say(state, side, 'Shadow Mark: Parry and Shield break, the first card ignores Block')
        }
        p.perkData = { ...p.perkData, markAt: crit.size ? state.turn : 0 }
        if (crit.size) say(state, side, 'Shadow Mark: the enemy is Marked')
      },
      blockDmgPct: (state, side) => num(state, side, 'AS:2', 'ascShadowMarkBlockCut'),
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
  'MG:2:C1': (_, k) => ({
    tune: (t, v) => {
      add(t, 'MG:2', 'frostArmorRegen', v(k))
      add(t, 'MG:2', 'frostArmorCap', v('ascHoarfrostCap'))
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
        for (const s of state.players[other(side)].statuses) if (s.kind === 'noStrike' || s.kind === 'frozen' || s.kind === 'thaw') s.turns += amt(state, side)
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
  return { letters: LETTERS.slice(0, t?.branches.length ?? 2), depth: t?.depth ?? 4, maxCapstones: t?.maxCapstones ?? Infinity }
}
/** Points a Style's tree gets: game_config asc_points + the tree's own bonus. */
export const treePoints = (style: string | undefined, base: number) => base + ((style && TREES[style]?.bonusPoints) || 0)

/** Can these node ids be taken together in this Style's tree? Top-down per branch, at most `points` of them. */
export function validAsc(ids: string[], points: number, style?: string): boolean {
  if (ids.length > points || new Set(ids).size !== ids.length) return false
  const { letters, depth, maxCapstones } = treeShape(style)
  if (ids.filter((id) => Number(id.slice(1)) === depth).length > maxCapstones) return false
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
  for (const k of keys) PIECES[k].lastTune?.(t, at(gameTuning, PIECES[k].group), p.championId)
  p.tuning = t
  for (const k of keys) PIECES[k].setup?.(p, at(t, PIECES[k].group))
  const res = resourceOf(p.championId, t)
  if (res && !res.payWithHp) p.res = Math.min(res.cap, res.start)
}

/** A random full loadout for the AI: any Oath (no Minor: Sigil II is off, Q 2026-10-25), and all points spent down random branches of its Style's tree. */
export function randomLoadout(champ: string, style: string | undefined, points: number, rand: () => number = Math.random): Loadout {
  const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(rand() * xs.length)]
  const pts = treePoints(style, points)
  const asc = fillAsc(style, pts, [], rand)
  return { oath: pick(OATHS[champ] ?? [])?.id, asc, points: pts }
}

/** Spend the points left after `taken` down random branches (AI loadout, the player's Quick build). */
export function fillAsc(style: string | undefined, pts: number, taken: string[] = [], rand: () => number = Math.random): string[] {
  const asc = validAsc(taken, pts, style) ? [...taken] : []
  if (!style || !TREES[style]) return asc
  while (asc.length < pts) {
    const next = [...treeShape(style).letters].map((b) => `${b}${asc.filter((x) => x[0] === b).length + 1}`).filter((id) => validAsc([...asc, id], pts, style))
    if (!next.length) break
    asc.push(next[Math.floor(rand() * next.length)])
  }
  return asc
}

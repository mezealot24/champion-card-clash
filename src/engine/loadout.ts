// Loadout (design/customization-options-2026-10-18.md): Sigil I · Oath + Sigil II · Minor + Ascendancy nodes of the
// picked Style. Content and numbers: loadoutData.ts (numbers tunable in Admin). Here is what each piece does.
// A piece changes this player's own numbers (deltas on their tuning copy), sets them up at the start, and/or hooks
// into the turn like a Style (StyleDef hooks, registered in PERK_HOOKS). Pieces never touch the other player's numbers.
import { MINORS, OATHS, TREES } from './loadoutData'
import { resourceOf } from './resources'
import { addChill, hooksOf, PERK_HOOKS, styleHeal, type StyleDef } from './styles'
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
  'TK:1:A1': (_, k) => ({ tune: (t, v) => add(t, 'TK:1', 'hpPct', v(k)) }),
  'TK:1:A2': (_, k) => ({ tune: (t, v) => add(t, 'TK:1', 'healPctPerHit', v(k)) }),
  'TK:1:A3': (_, k) => ({ tune: (t, v) => add(t, 'TK', 'comboHealPct', v(k)) }),
  'TK:1:A4': (amt) => ({
    hooks: {
      onHpLoss: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || pctHp(p) >= RED_PCT || !once(p, 'bastion')) return
        status(p, 'shield', amt(state, side))
        say(state, side, `Last Bastion: Shield ${amt(state, side)}`)
      },
    },
  }),
  'TK:1:B1': (_, k) => ({ setup: (p, v) => addMaxHp(p, v(k)) }),
  'TK:1:B2': (amt) => ({ hooks: { blockBonus: (state, side) => (pctHp(state.players[side]) < RED_PCT ? amt(state, side) : 0) } }),
  'TK:1:B3': (_, k) => ({ setup: (p, v) => cost(p, 0, -v(k)) }),
  'TK:1:B4': (amt) => ({
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

  'TK:2:A1': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'perFacing', v(k)) }),
  'TK:2:A2': (_, k) => ({
    setup: (p, v) => {
      p.maxHp += v(k)
      p.styleData = { ...p.styleData, grown: (p.styleData?.grown ?? 0) + v(k) }
    },
  }),
  'TK:2:A3': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'hpPerDmg', -v(k)) }),
  'TK:2:A4': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'perHitTaken', v(k)) }),
  'TK:2:B1': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'perHitBlocked', v(k)) }),
  'TK:2:B2': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (!r.hitsBlocked) return
        const got = styleHeal(state, side, amt(state, side))
        if (got) say(state, side, `Sap: heals ${got}`)
      },
    },
  }),
  'TK:2:B3': (_, k) => ({ tune: (t, v) => add(t, 'TK:2', 'maxHpCap', v(k)) }),
  'TK:2:B4': (amt) => ({
    hooks: {
      endTurn: (state, side, action) => {
        if (action !== 'block') return
        const got = styleHeal(state, side, amt(state, side))
        if (got) say(state, side, `World Tree: heals ${got}`)
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

  'MG:1:A1': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'igniteMax', v(k)) }),
  'MG:1:A2': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'igniteFlat', v(k)) }),
  'MG:1:A3': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'healCutMax', v(k)) }),
  'MG:1:A4': (_, k) => ({ tune: (t, v) => add(t, 'MG', 'infusePerS', v(k)) }),
  'MG:1:B1': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'moltenShieldPerMana', v(k)) }),
  'MG:1:B2': (_, k) => ({ tune: (t, v) => add(t, 'MG:1', 'moltenMaxMana', v(k)) }),
  'MG:1:B3': (_, k) => ({ setup: (p, v) => addMaxHp(p, v(k)) }),
  'MG:1:B4': (amt) => ({
    hooks: {
      onHpLoss: (state, side) => {
        const p = state.players[side]
        if (p.hp <= 0 || pctHp(p) >= RED_PCT || !once(p, 'phoenix')) return
        const n = amt(state, side)
        const got = styleHeal(state, side, n)
        status(p, 'shield', n)
        say(state, side, `Phoenix Ash: heals ${got}, Shield ${n}`)
      },
    },
  }),

  'MG:2:A1': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'chillDmgCut', v(k)) }),
  'MG:2:A2': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'shatterPct', v(k)) }),
  'MG:2:A3': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'chillTurns', v(k)) }),
  'MG:2:A4': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'chillMax', -v(k)) }),
  'MG:2:B1': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'frostArmorShield', v(k)) }),
  'MG:2:B2': (_, k) => ({ tune: (t, v) => add(t, 'MG:2', 'tombHeal', v(k)) }),
  'MG:2:B3': (_, k) => ({ setup: (p, v) => addMaxHp(p, v(k)) }),
  'MG:2:B4': (amt) => ({
    hooks: {
      afterHits: (state, side, r) => {
        if (!r.shieldHits) return
        const n = addChill(state, other(side), r.shieldHits * amt(state, side))
        say(state, side, `Glacier Heart: enemy gets more ❄ Chill${n ? ` (${n} stacks)` : ''}`)
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
    const key = `asc${n.id}`
    const make = NODE_FX[`${style}:${n.id}`]
    if (make) PIECES[`asc:${style}:${n.id}`] = { group: style, ...make((state, side) => num(state, side, style, key), key) }
  }
for (const [k, piece] of Object.entries(PIECES)) if (piece.hooks) PERK_HOOKS[k] = { name: k, ...piece.hooks }

/** Can these node ids be taken together? Top-down per branch, at most `points` of them. */
export function validAsc(ids: string[], points: number): boolean {
  if (ids.length > points || new Set(ids).size !== ids.length) return false
  return ids.every((id) => /^[AB][1-4]$/.test(id) && (id[1] === '1' || ids.includes(`${id[0]}${Number(id[1]) - 1}`)))
}

/** The perk keys a loadout gives this Champion + Style (unknown or illegal picks are left out). */
export function perkKeys(champ: string, style: string | undefined, l: Loadout | undefined): string[] {
  if (!l) return []
  const out: string[] = []
  if (l.oath && PIECES[`oath:${champ}:${l.oath}`]) out.push(`oath:${champ}:${l.oath}`)
  if (l.minor && PIECES[`minor:${l.minor}`]) out.push(`minor:${l.minor}`)
  if (style && l.asc && validAsc(l.asc, l.points ?? 5)) for (const id of l.asc) if (PIECES[`asc:${style}:${id}`]) out.push(`asc:${style}:${id}`)
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

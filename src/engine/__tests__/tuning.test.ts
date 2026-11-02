// Admin tuning (engine/tuning.ts): DB overrides change the numbers a game runs on; no overrides = the game as designed.
import { describe, expect, it } from 'vitest'
import { cleanParams, createGame, fillText, unknownPlaceholders, DEFAULT_TUNING, resolveTurn, resolveTuning, rulesFromConfig, TUNING_FIELDS, tuningErrors, tuningFromRows } from '../index'
import type { CardDef, CardInst, GameState, TuningOverrides } from '../index'

let uid = 0
const card = (dmg: number, type: 'P' | 'K' | 'S' = 'P'): CardInst => ({ uid: `t${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(champ: string, style: string | undefined, tuning?: TuningOverrides, hp = 100): GameState {
  return createGame({ championId: champ, hpStart: hp, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1, tuning })
}

describe('resolveTuning', () => {
  it('fills every group with the defaults', () => {
    const t = resolveTuning()
    for (const [g, fields] of Object.entries(TUNING_FIELDS)) for (const f of fields) expect((t as Record<string, Record<string, number>>)[g][f.key]).toBe(f.def)
  })

  it('takes numbers from the DB, ignores junk and unknown keys', () => {
    const t = resolveTuning({ 'MG:2': { shatterPct: 20, chillMax: '9', nope: 1 }, ZZ: { x: 1 } })
    expect(t['MG:2'].shatterPct).toBe(20)
    expect(t['MG:2'].chillMax).toBe(DEFAULT_TUNING['MG:2'].chillMax)
    expect('nope' in t['MG:2']).toBe(false)
  })

  it('maps champions / champion_styles rows to groups', () => {
    const o = tuningFromRows([{ id: 'BR', params: { cap: 30 } }], [{ champion_id: 'BR', slot: 1, params: { bonusDmg: 5 } }])
    expect(resolveTuning(o).BR.cap).toBe(30)
    expect(resolveTuning(o)['BR:1'].bonusDmg).toBe(5)
  })

  it('a game keeps its tuning on the state, defaults when none given', () => {
    expect(game('MG', 'MG:2').tuning).toEqual(DEFAULT_TUNING)
    expect(game('MG', 'MG:2', { 'MG:2': { frostArmorShield: 25 } }).tuning!['MG:2'].frostArmorShield).toBe(25)
  })
})

describe('tuned numbers reach the engine', () => {
  it('Cryomancer Frost Armor Shield', () => {
    expect(game('MG', 'MG:2').players.p1.statuses.find((s) => s.kind === 'shield')?.n).toBe(30)
    expect(game('MG', 'MG:2', { 'MG:2': { frostArmorShield: 25 } }).players.p1.statuses.find((s) => s.kind === 'shield')?.n).toBe(25)
    expect(game('MG', 'MG:2', { 'MG:2': { frostArmorShield: 0 } }).players.p1.statuses.some((s) => s.kind === 'shield')).toBe(false)
  })

  it('resource start + cap', () => {
    const s = game('AS', undefined, { AS: { start: 1, cap: 5 } })
    expect(s.players.p1.res).toBe(1)
    s.players.p1.res = 5
    const after = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(after.players.p1.res).toBeLessThanOrEqual(5)
  })

  it('Fury bonus and HP line', () => {
    const hit = (t?: TuningOverrides, hp = 40) => {
      const s = game('BR', 'BR:1', t, hp)
      s.players.p1.hand = [card(10), card(10)]
      return 100 - resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp
    }
    expect(hit()).toBe(40) // 2 × (10 + 10)
    expect(hit({ 'BR:1': { bonusDmg: 3 } })).toBe(26)
    expect(hit({ 'BR:1': { slots: 1 } })).toBe(30)
    expect(hit({ 'BR:1': { hpPct: 30 } })).toBe(20) // 40% HP is no longer below the line
  })

  it('Assassin Sonic Bliz start draw', () => {
    expect(game('AS', 'AS:1').players.p1.hand).toHaveLength(3)
    expect(game('AS', 'AS:1', { 'AS:1': { startDraw: 1 } }).players.p1.hand).toHaveLength(1)
  })

  it('Tank P+K+P combo heal %', () => {
    const heal = (t?: TuningOverrides) => {
      const s = game('TK', undefined, t, 50)
      s.players.p1.hand = [card(1, 'P'), card(1, 'K'), card(1, 'P')]
      return resolveTurn(s, { p1: 'strike', p2: 'block' }).players.p1.hp - 50
    }
    expect(heal()).toBe(5)
    expect(heal({ TK: { comboHealPct: 20 } })).toBe(10)
  })
})

describe('rules + Admin helpers', () => {
  it('game_config rows the engine reads', () => {
    expect(rulesFromConfig([{ key: 'hand_max', value: 4 }, { key: 'deck_size', value: 25 }, { key: 'charge_draw', value: '2' }])).toEqual({ handMax: 4 })
    const s = createGame({ championId: 'XX', hpStart: 100, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { rules: rulesFromConfig([{ key: 'start_hand', value: 2 }]) })
    expect(s.players.p1.hand).toHaveLength(2)
  })

  it('saves only numbers that differ from the default; checks ranges', () => {
    expect(cleanParams('MG:2', { shatterPct: 15, chillMax: 5, nope: 1 })).toEqual({ chillMax: 5 })
    expect(tuningErrors('MG:2', { shatterPct: 120 })).toHaveLength(1)
    expect(tuningErrors('MG:2', { chillMax: 2.5 })).toHaveLength(1)
    expect(tuningErrors('AS:2', { critMult: 2.5 })).toHaveLength(0)
  })
})

describe('text linked to the numbers', () => {
  it('fills {key} from its own group, {GROUP.key} from any, |ord, extras', () => {
    const t = resolveTuning({ 'MG:2': { shatterPct: 20 }, 'AS:2': { every: 3 } })
    expect(fillText('Shatter takes {shatterPct}% (cap {MG.cap})', 'MG:2', t)).toBe('Shatter takes 20% (cap 5)')
    expect(fillText('Every {every|ord} attack', 'AS:2', t)).toBe('Every 3rd attack')
    expect(fillText('HP {hpStart}', 'TK:2', t, { hpStart: 250 })).toBe('HP 250')
    expect(fillText('{nope} stays', 'MG:2', t)).toBe('{nope} stays')
  })

  it('lists unknown placeholders', () => {
    expect(unknownPlaceholders('{shatterPct} {nope} {MG.cap} {hpStart}', 'MG:2', ['hpStart'])).toEqual(['{nope}'])
  })
})

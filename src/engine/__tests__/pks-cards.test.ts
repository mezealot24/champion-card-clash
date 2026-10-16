// Q 2026-10-16: P/K/S matter more. New conditions chainHas / prevIs / facingIs / fieldHas, per chainP/K/S,
// and 5 type-aware cards per Champion (migration 20261016000005).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { Action, CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261016000005_pks_cards_deck25.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('((?:AS|BR|TK|MG)-\d{3})', .*'(\[.*\])'::jsonb/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))

let uid = 0
const card = (id: string, type: CardType, dmg: number): CardInst => ({ uid: `c${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

function game(p1: CardInst[], p2: CardInst[], hp = 60): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame({ championId: 'P1', hpStart: hp, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 7 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const turn = (s: GameState, p1: Action, p2: Action) => resolveTurn(s, { p1, p2 })
const foeHp = (s: GameState) => s.players.p2.hp
const myHp = (s: GameState) => s.players.p1.hp

it('has 5 new cards per Champion', () => {
  const ids = Object.keys(specs)
  for (const c of ['TK', 'BR', 'AS', 'MG']) expect(ids.filter((i) => i.startsWith(c))).toHaveLength(5)
})

describe('Tank reads the opponent', () => {
  it('TK-021 Iron Palm: opponent Kicks −5 while you Block', () => {
    expect(myHp(turn(game([card('TK-021', 'P', 8)], [plain(10, 'K'), plain(10, 'K'), plain(10, 'K')]), 'block', 'strike'))).toBe(55)
    expect(myHp(turn(game([card('TK-021', 'P', 8)], [plain(10, 'P'), plain(10, 'P'), plain(10, 'P')]), 'block', 'strike'))).toBe(50)
  })
  it('TK-022 Stone Skin: heal 4 per Punch in your chain', () => {
    expect(myHp(turn(game([plain(1, 'P'), card('TK-022', 'P', 10), plain(1, 'K')], []), 'strike', 'charge'))).toBe(68)
  })
  it('TK-023 Counter Kick: x3 when facing a Kick', () => {
    expect(foeHp(turn(game([card('TK-023', 'K', 6)], [plain(1, 'K')]), 'strike', 'charge'))).toBe(82)
    expect(foeHp(turn(game([card('TK-023', 'K', 6)], [plain(1, 'P')]), 'strike', 'charge'))).toBe(94)
  })
  it('TK-025 Combo Breaker (Q): opponent Kicks deal 0 only when their chain has P and K', () => {
    expect(myHp(turn(game([card('TK-025', 'K', 8)], [plain(10, 'P'), plain(10, 'K')]), 'charge', 'strike'))).toBe(50)
    expect(myHp(turn(game([card('TK-025', 'K', 8)], [plain(10, 'K'), plain(10, 'K')]), 'charge', 'strike'))).toBe(40)
  })
})

describe('Bruiser one-type power', () => {
  it('BR-021 Rush: +4 per Punch with 2+ Punch', () => {
    expect(foeHp(turn(game([plain(0, 'P'), card('BR-021', 'P', 8)], []), 'strike', 'charge'))).toBe(84)
    expect(foeHp(turn(game([plain(0, 'K'), card('BR-021', 'P', 8)], []), 'strike', 'charge'))).toBe(92)
  })
  it('BR-023 One-Two: +10 after a Punch only', () => {
    expect(foeHp(turn(game([plain(0, 'P'), card('BR-023', 'K', 9)], []), 'strike', 'charge'))).toBe(81)
    expect(foeHp(turn(game([plain(0, 'K'), card('BR-023', 'K', 9)], []), 'strike', 'charge'))).toBe(91)
    expect(foeHp(turn(game([card('BR-023', 'K', 9), plain(0, 'P')], []), 'strike', 'charge'))).toBe(91)
  })
  it('BR-025 Finisher ignores Block with 2+ Punch', () => {
    const chain = (x: CardInst) => [plain(0, 'P'), plain(0, 'P'), x]
    expect(foeHp(turn(game(chain(card('BR-025', 'S', 30)), []), 'strike', 'block'))).toBe(70)
  })
})

describe('Assassin rhythm', () => {
  it('AS-025 Quick Jab (Q): draw 1 when the chain has P and K', () => {
    expect(turn(game([card('AS-025', 'P', 5), plain(0, 'K')], []), 'strike', 'charge').players.p1.hand).toHaveLength(1)
    expect(turn(game([card('AS-025', 'P', 5), plain(0, 'P')], []), 'strike', 'charge').players.p1.hand).toHaveLength(0)
  })
  it('AS-027 Feint cuts a facing Skill', () => {
    const s = turn(game([card('AS-027', 'P', 5)], [plain(1, 'S'), plain(1, 'P')]), 'strike', 'charge')
    expect(s.players.p2.hand.some((c) => c.def.type === 'S')).toBe(false)
  })
  it('AS-028 Rhythm Strike x2 with P and K in the chain', () => {
    expect(foeHp(turn(game([plain(0, 'P'), plain(0, 'K'), card('AS-028', 'S', 8)], []), 'strike', 'charge'))).toBe(84)
  })
})

describe('Mage Skill engine', () => {
  it('MG-021 Spark: next Skill +6', () => {
    expect(foeHp(turn(game([card('MG-021', 'P', 7), plain(1, 'S')], []), 'strike', 'charge'))).toBe(86)
    expect(foeHp(turn(game([card('MG-021', 'P', 7), plain(1, 'K')], []), 'strike', 'charge'))).toBe(92)
  })
  it('MG-024 Arcane Echo: +3 per Skill in the chain', () => {
    expect(foeHp(turn(game([plain(0, 'S'), card('MG-024', 'S', 6)], []), 'strike', 'charge'))).toBe(88)
  })
  it('MG-025 Counterspell: facing Skill deals 0', () => {
    expect(myHp(turn(game([card('MG-025', 'K', 8)], [plain(10, 'S'), plain(10, 'P')]), 'charge', 'strike'))).toBe(50)
  })
})

it('an unknown condition never passes and an unknown action does nothing', () => {
  const odd = { uid: 'odd', def: { id: 'XX-999', type: 'P' as const, dmg: 5, effectText: '', effectSpec: [{ hook: 'modify', if: [{ c: 'nope' }], do: [{ a: 'addDmg', target: 'this', n: 50 }] }, { hook: 'modify', do: [{ a: 'nope' }] }] as unknown as EffectSpec } }
  expect(foeHp(turn(game([odd], []), 'strike', 'charge'))).toBe(95)
})

// Shield / Parry (Q 2026-10-15 16:53Z) and the Tank cards that use them (migration 20261015000006).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { Action, CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261015000006_tank_shield_parry.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('(TK-\d{3})', '[^']*', '(?:[^']|'')*',\s*'(\[.*\])'\)/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))

let uid = 0
const tk = (id: string, type: CardType = 'P', dmg = 4): CardInst => ({ uid: `t${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

function game(p1: CardInst[], p2: CardInst[]): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame({ championId: 'TK', hpStart: 100, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 7 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const turn = (s: GameState, p1: Action, p2: Action) => resolveTurn(s, { p1, p2 })
const hp = (s: GameState) => [s.players.p1.hp, s.players.p2.hp]

it('has the 5 reworked Tank cards', () => expect(Object.keys(specs).sort()).toEqual(['TK-006', 'TK-007', 'TK-008', 'TK-012', 'TK-019']))

describe('Shield', () => {
  it('absorbs hit dmg, carries over, and a fully absorbed hit is not clean', () => {
    const s = game([plain()], [plain(4), plain(4)])
    s.players.p1.statuses.push({ kind: 'shield', turns: 2, n: 6 })
    const after = turn(s, 'block', 'charge')
    expect(after.players.p1.statuses.find((x) => x.kind === 'shield')?.n).toBe(6) // not attacked, still there
    after.players.p2.hand = [plain(4), plain(4)]
    const hit = turn(after, 'charge', 'strike')
    expect(hp(hit)[0]).toBe(98) // 4 absorbed, then 2 absorbed + 2 lands
    expect(hit.players.p1.statuses.some((x) => x.kind === 'shield')).toBe(false)
  })

  it('TK-008 gives Shield 10 that lasts through the next turn; TK-006 +10 with a Shield', () => {
    let s = turn(game([tk('TK-008', 'P', 10)], []), 'strike', 'charge')
    expect(s.players.p1.statuses.find((x) => x.kind === 'shield')?.n).toBe(10)
    s.players.p1.hand = [tk('TK-006', 'P', 13)]
    s.players.p2.hand = [plain(4)]
    s = turn(s, 'strike', 'strike')
    expect(hp(s)).toEqual([100, 100 - 10 - 23]) // shield ate the 4; Shield Bash 13 + 10
    s = turn(s, 'charge', 'charge')
    expect(s.players.p1.statuses.some((x) => x.kind === 'shield')).toBe(false) // expired
  })
})

describe('Parry', () => {
  it('TK-007: the first hit past Block is parried (0 dmg, nothing goes back)', () => {
    const s = turn(game([tk('TK-007', 'P', 10)], [plain(5), plain(5), plain(7), plain(3)]), 'block', 'strike')
    expect(hp(s)).toEqual([97, 100])
  })

  it('TK-012 protects a Charge; nothing without a Strike', () => {
    expect(hp(turn(game([tk('TK-012')], [plain(9), plain(2)]), 'charge', 'strike'))).toEqual([98, 100])
    expect(turn(game([tk('TK-012')], []), 'charge', 'charge').players.p1.statuses).toEqual([])
  })
})

it('TK-019 costs the opponent 3 HP per hit you blocked', () => {
  expect(hp(turn(game([tk('TK-019', 'K', 10)], [plain(5), plain(5), plain(5)]), 'block', 'strike'))).toEqual([95, 94])
})

const vdeck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
const vhit = (dmg: number) => plain(dmg)

describe('Vulnerable', () => {
  it('the side with Vulnerable 50 takes 50% more dmg from each hit, then it wears off', () => {
    let s = createGame({ championId: 'XX', hpStart: 100, hpMax: 100, deck: vdeck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck: vdeck }, { seed: 1 })
    s.players.p1.statuses.push({ kind: 'vulnerable', turns: 1, n: 50 })
    s.players.p2.hand = [vhit(10), vhit(10)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(s.players.p1.hp).toBe(70)
    s.players.p2.hand = [vhit(10)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(60)
  })
})

describe('Bruiser drawbacks (migration 20261015000008)', () => {
  const sql8 = readFileSync(new URL('../../../supabase/migrations/20261015000008_bruiser_drawbacks.sql', import.meta.url), 'utf8')
  const rules = [...sql8.matchAll(/'(\[.*?\])'::jsonb/g)].map((m) => JSON.parse(m[1]) as EffectSpec) // Exhaust, Recoil, Scar
  const rule = (name: 'Exhaust' | 'Recoil' | 'Scar') => rules[{ Exhaust: 0, Recoil: 1, Scar: 2 }[name]]
  const br = (spec: EffectSpec, dmg = 10): CardInst => ({ uid: `b${uid++}`, def: { id: 'BR-T', type: 'S', dmg, effectText: '', effectSpec: spec } })
  const g = () => createGame({ championId: 'BR', hpStart: 190, hpMax: 190, deck: vdeck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck: vdeck }, { seed: 1, rules: { resources: false } })

  it('Exhaust: next turn no Block and +50% dmg taken', () => {
    let s = g()
    s.players.p1.hand = [br(rule('Exhaust'))]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.statuses.map((x) => x.kind).sort()).toEqual(['noBlock', 'vulnerable'])
    s.players.p2.hand = [vhit(10)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(175)
  })
  it('Recoil: lose 30 HP when blocked', () => {
    const s = g()
    s.players.p1.hand = [br(rule('Recoil'))]
    expect(resolveTurn(s, { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(160)
  })
  it('Scar: Max HP -20 after Strike', () => {
    const s = g()
    s.players.p1.hand = [br(rule('Scar'))]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.maxHp).toBe(170)
  })
})

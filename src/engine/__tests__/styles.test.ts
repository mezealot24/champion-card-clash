// Tank Styles: Second Wind (TK:1) and Overgrowth (TK:2).
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Tank with a Style, p2 = attacker
function game(style: string, hp: number, maxHp = 100): GameState {
  return createGame({ championId: 'TK', hpStart: hp, hpMax: maxHp, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
}

describe('Second Wind', () => {
  it('heals 4% of missing HP per hit taken while below 60%', () => {
    const s = game('TK:1', 50)
    s.players.p2.hand = [hit(10), hit(10)]
    // 50 - 20 = 30 → missing 70 → 4% x 2 hits = 5.6 → 5
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(35)
  })

  it('does nothing at 60%+ or when no hit lands', () => {
    const s = game('TK:1', 100)
    s.players.p2.hand = [hit(10)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(90)
    const b = game('TK:1', 30)
    b.players.p2.hand = [hit(10)]
    expect(resolveTurn(b, { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(30)
  })

  it('switches off for good once HP gets back above 60%', () => {
    let s = game('TK:1', 50)
    s.players.p2.hand = [hit(1)]
    s = resolveTurn(s, { p1: 'block', p2: 'charge' }) // below 60%, no hit
    s.players.p1.hp = 70
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(s.players.p1.styleData?.spent).toBe(1)
    s.players.p1.hp = 40
    s.players.p2.hand = [hit(10)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(30)
  })
})

describe('Overgrowth', () => {
  it('starts at Max HP 160', () => {
    const s = game('TK:2', 160, 250)
    expect([s.players.p1.hp, s.players.p1.maxHp]).toEqual([160, 160])
  })

  it('+1 per hit, +2 per hit blocked, +3 per facing card when attacked', () => {
    const s = game('TK:2', 160, 250)
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    // Block stops 2 (+4), 1 hit lands (+1), 2 facing pairs (+6)
    const after = resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1
    expect([after.maxHp, after.hp]).toEqual([171, 160 - 1 + 11])
    const quiet = game('TK:2', 160, 250)
    expect(resolveTurn(quiet, { p1: 'charge', p2: 'charge' }).players.p1.maxHp).toBe(160)
  })

  it('caps at 500', () => {
    const s = game('TK:2', 160, 250)
    s.players.p1.maxHp = 499
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.maxHp).toBe(500)
  })
})

describe('Bruiser Styles', () => {
  const br = (style: string, hp: number) =>
    createGame({ championId: 'BR', hpStart: hp, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })

  it('Fury: slot 1 and 2 +10 while HP < 50%', () => {
    const s = br('BR:1', 49)
    s.players.p1.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 23)
    const ok = br('BR:1', 50)
    ok.players.p1.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(ok, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(97)
  })

  it('Tenacity: charge break skips slot 1 and 2 while HP < 50%', () => {
    const field = () => [hit(1), hit(2), hit(3)]
    const s = br('BR:2', 40)
    s.players.p1.hand = field()
    s.players.p2.hand = [hit(1)]
    const kept = resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hand.map((c) => c.def.dmg)
    expect(kept.slice(0, 2)).toEqual([1, 2]) // slot 3 was lost, then Charge drew nothing (Strike won)
    expect(kept).toHaveLength(2)
    const two = br('BR:2', 40)
    two.players.p1.hand = [hit(1), hit(2)]
    two.players.p2.hand = [hit(1)]
    expect(resolveTurn(two, { p1: 'charge', p2: 'strike' }).players.p1.hand).toHaveLength(2)
    const healthy = br('BR:2', 90)
    healthy.players.p1.hand = field()
    healthy.players.p2.hand = [hit(1)]
    expect(resolveTurn(healthy, { p1: 'charge', p2: 'strike' }).players.p1.hand.map((c) => c.def.dmg)).toEqual([2, 3])
  })
})

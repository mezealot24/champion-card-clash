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
  it('starts at Max HP 210', () => {
    const s = game('TK:2', 210, 300)
    expect([s.players.p1.hp, s.players.p1.maxHp]).toEqual([210, 210])
  })

  it('+1 per hit, +2 per hit blocked, +3 per facing card when attacked (Max HP only)', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    // Block stops 2 (+4), 1 hit lands (+1), 2 facing pairs (+6)
    const after = resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1
    expect([after.maxHp, after.hp]).toEqual([221, 210 - 1]) // Max HP grows, current HP does not heal
    const quiet = game('TK:2', 210, 300)
    expect(resolveTurn(quiet, { p1: 'charge', p2: 'charge' }).players.p1.maxHp).toBe(210)
  })

  it('caps at 500', () => {
    const s = game('TK:2', 210, 300)
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

  it('Juggernaut: +1 Conqueror per chain card before it hits; +1 dmg per stack', () => {
    const s = br('BR:2', 90)
    s.players.p1.hand = [hit(10), hit(10)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p1.comboData?.conqueror).toBe(2)
    expect(t.players.p2.hp).toBe(100 - 24) // each hit 10 + 2 stacks
  })

  it('Juggernaut: caps at 6, then Tenacity keeps slot 1 safe from charge break for 2 turns', () => {
    const s = br('BR:2', 90)
    s.players.p1.comboData = { conqueror: 4 }
    s.players.p1.hand = [hit(1), hit(1), hit(1)]
    let t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p1.comboData?.conqueror).toBe(6)
    for (let turn = 0; turn < 2; turn++) {
      t.players.p1.hand = [hit(7), hit(8)]
      t.players.p2.hand = [hit(1)]
      t = resolveTurn(t, { p1: 'charge', p2: 'strike' })
      expect(t.players.p1.hand[0].def.dmg).toBe(7) // slot 1 kept
    }
    t.players.p1.hand = [hit(7), hit(8)]
    t.players.p2.hand = [hit(1)]
    expect(resolveTurn(t, { p1: 'charge', p2: 'strike' }).players.p1.hand.map((c) => c.def.dmg)).not.toContain(7) // Tenacity over
  })

  it('Juggernaut: Block costs 1 stack, Charge keeps them', () => {
    const s = br('BR:2', 90)
    s.players.p1.comboData = { conqueror: 2 }
    const t = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(t.players.p1.comboData?.conqueror).toBe(1)
    const c = resolveTurn(t, { p1: 'charge', p2: 'block' })
    expect(c.players.p1.comboData?.conqueror).toBe(1)
    expect(resolveTurn(c, { p1: 'block', p2: 'block' }).players.p1.comboData?.conqueror).toBe(0)
  })
})

describe('Overgrowth dmg (Q buff 2026-10-16)', () => {
  it('every 20 Max HP grown = +1 dmg on every card you strike with', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.styleData = { grown: 45 } // +2
    s.players.p1.hand = [hit(5), hit(5)]
    const after = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(100 - after.players.p2.hp).toBe(14)
  })
  it('no bonus below 20 grown', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.styleData = { grown: 19 }
    s.players.p1.hand = [hit(5)]
    expect(100 - resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(5)
  })
  it('counts what it grew', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1.styleData?.grown).toBe(11)
  })
})

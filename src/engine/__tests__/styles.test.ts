// Tank Styles: Iron Will (TK:1) and Titan Bloom (TK:2).
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

describe('Iron Will', () => {
  it('starts with 1 Endurance and carries the Costs (heal −50%, S cost 10% current HP)', () => {
    const s = game('TK:1', 100)
    expect(s.players.p1.perkData?.endurance).toBe(1)
    expect(s.players.p1.perkData?.healPct).toBe(50)
    expect(s.players.p1.costMod?.hpPct).toBe(10)
  })

  it('blocked hits after the first still deal 50%', () => {
    const s = game('TK:1', 100)
    s.players.p2.hand = [hit(20), hit(20)]
    expect(resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(90)
  })

  it('Endurance fades, then Vulnerable 25% next turn', () => {
    let s = game('TK:1', 100)
    for (let i = 0; i < 4; i++) s = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(s.players.p1.perkData?.endurance).toBe(0)
    expect(s.players.p1.statuses.some((x) => x.kind === 'vulnerable' && x.n === 25)).toBe(true)
  })
})

describe('Titan Bloom', () => {
  it("starts at the Tank's normal HP / Max HP, same as Lifeline", () => {
    const s = game('TK:2', 210, 300)
    expect([s.players.p1.hp, s.players.p1.maxHp]).toEqual([210, 300])
  })

  it('+1 per hit, +2 per hit blocked, +3 per facing card when attacked (Max HP only)', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    // Block stops 2 (+4), 1 hit lands (+1), 2 facing pairs (+6)
    const after = resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1
    expect([after.maxHp, after.hp]).toEqual([311, 210 - 1]) // Max HP grows, current HP does not heal
    const quiet = game('TK:2', 210, 300)
    expect(resolveTurn(quiet, { p1: 'charge', p2: 'charge' }).players.p1.maxHp).toBe(300)
  })

  it('caps at 500', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.maxHp = 499
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.maxHp).toBe(500)
  })

  it('end of turn: +2 Max HP per debuff stack on you (Q buff 2026-10-25)', () => {
    const s = game('TK:2', 210, 300)
    // 3 Ignite stacks + can't Block = 4 stacks
    s.players.p1.statuses = [{ kind: 'ignite', turns: 3, n: 3 }, { kind: 'noBlock', turns: 2 }]
    const after = resolveTurn(s, { p1: 'charge', p2: 'charge' }).players.p1
    expect(after.maxHp).toBe(308)
    expect(after.styleData?.grown).toBe(8)
    const clean = game('TK:2', 210, 300)
    clean.players.p1.statuses = [{ kind: 'shield', turns: 2, n: 10 }, { kind: 'blockPlus', turns: 1, n: 1 }]
    expect(resolveTurn(clean, { p1: 'charge', p2: 'charge' }).players.p1.maxHp).toBe(300)
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

  it('Juggernaut: +1 Momentum per chain card before it hits; +1 dmg per stack', () => {
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

describe('Titan Bloom dmg (Q buff 2026-10-16)', () => {
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

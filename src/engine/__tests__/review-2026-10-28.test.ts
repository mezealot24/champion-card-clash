// Bug review 2026-10-28 (Q: Titan Bloom vs Pyromancer screenshot): what the cards say vs what they do.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { describeSpec } from '../effects/describe'
import type { CardDef, CardInst, EffectSpec, GameState } from '../index'

let uid = 0
const card = (spec: EffectSpec, type: CardDef['type'] = 'P', dmg = 1): CardInst => ({ uid: `c${uid++}`, def: { id: 'AA-001', type, dmg, effectText: '', effectSpec: spec } })
const hit = (dmg: number): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(p1: CardInst[], p2: CardInst[] = [], champ = 'AA'): GameState {
  const s = createGame({ championId: champ, hpStart: 100, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1, rules: { resources: false } })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}

describe('Parry gained Before action (TK-007, MG-056)', () => {
  const spec: EffectSpec = [{ hook: 'modify', if: [{ c: 'selfAction', a: 'block' }, { c: 'enemyAction', a: 'strike' }], do: [{ a: 'status', who: 'self', kind: 'parry', turns: 1, n: 1 }] }]

  it('guards this turn: the first hit past Block deals 0, and it is gone next turn', () => {
    // Block stops 2, the 3rd hit is the first past it: Parried
    const s = resolveTurn(game([card(spec)], [hit(5), hit(5), hit(7), hit(9)]), { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(100 - 9)
    expect(s.players.p1.statuses.some((x) => x.kind === 'parry')).toBe(false)
  })

  it('so the card text says this turn, not next turn', () => {
    expect(describeSpec(spec)).toContain('Gain Parry 1 this turn')
  })
})

describe('Empower (TK-026)', () => {
  const spec: EffectSpec = [{ hook: 'onHeld', if: [{ c: 'selfAction', a: 'charge' }, { c: 'notHit' }], do: [{ a: 'status', who: 'self', kind: 'empower', turns: 9999, n: 3 }] }]

  it('three quiet Charges leave one Empower +3, not three', () => {
    let s = game([card(spec)])
    for (let i = 0; i < 3; i++) s = resolveTurn(s, { p1: 'charge', p2: 'block' })
    const emp = s.players.p1.statuses.filter((x) => x.kind === 'empower')
    expect(emp).toEqual([{ kind: 'empower', turns: 9999, n: 3 }])
  })
})

describe('card text for a payment', () => {
  it('a negative resource gain reads as losing it, named after the class resource', () => {
    const spec: EffectSpec = [{ hook: 'modify', do: [{ a: 'gainRes', who: 'self', n: -5 }] }]
    expect(describeSpec(spec)).toBe('Before action: Lose 5 resource')
    expect(describeSpec(spec, undefined, 'Rage')).toBe('Before action: Lose 5 Rage')
  })
})

describe('Tank HP costs (resources.ts payChain)', () => {
  it('a Silenced Strike forgets what a copy cost on an earlier turn', () => {
    const c = card([], 'S', 5)
    c.paidHp = 15
    const s = game([c], [], 'TK')
    s.rules.resources = true
    s.players.p1.statuses.push({ kind: 'silence', turns: 2 })
    // resolveTurn clones the state: read the copy that went under the deck
    const after = resolveTurn(s, { p1: 'strike', p2: 'block' }).players.p1.deck.find((x) => x.uid === c.uid)
    expect(after?.paidHp).toBeUndefined()
  })
})

describe('Titan Bloom throwing the tree', () => {
  it('HP it loses with the grown Max HP shows up as an hp event (the HP bar plays events back)', () => {
    // a 4-card Strike (throwCards) while holding the tree (grown > treeAt) throws it: Max HP −50 (throwCost)
    const s = game([hit(1), hit(1), hit(1), hit(1)], [], 'TK')
    const p = s.players.p1
    p.style = 'TK:2'
    p.styleData = { grown: 200 }
    p.maxHp = 300
    p.hp = 300
    const after = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(after.events?.some((e) => e.k === 'hp' && e.side === 'p1' && e.delta === -50)).toBe(true)
  })
})

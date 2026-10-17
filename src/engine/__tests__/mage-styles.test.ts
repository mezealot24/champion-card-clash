// Mage Styles: Pyromancer (MG:1) and Mana Barrier (MG:2).
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { heal } from '../state'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Mage with a Style, p2 = plain opponent
const game = (style: string): GameState =>
  createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
const shield = (s: GameState) => s.players.p1.statuses.filter((x) => x.kind === 'shield').reduce((t, x) => t + (x.n ?? 0), 0)

const skill = (dmg: number, cost = 0): CardInst => ({ uid: `s${uid++}`, def: { id: 'MG-900', type: 'S', dmg, effectText: '', cost } })
const ignite = (s: GameState, side: 'p1' | 'p2' = 'p2') => s.players[side].statuses.find((x) => x.kind === 'ignite')

describe('Pyromancer', () => {
  it('a Strike with a Skill card and Mana left spends 1 Mana to Ignite, even when Blocked', () => {
    const s = game('MG:1')
    s.players.p1.res = 3
    s.players.p1.hand = [hit(5), skill(5, 2)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(n.players.p1.res).toBe(0) // 2 for the card, 1 for Ignite
    expect(ignite(n)?.n).toBe(1)
  })
  it('no Skill card or no Mana left = no Ignite', () => {
    const s = game('MG:1')
    s.players.p1.res = 2
    s.players.p1.hand = [skill(5, 2)]
    expect(ignite(resolveTurn(s, { p1: 'strike', p2: 'charge' }))).toBeUndefined()
    const t = game('MG:1')
    t.players.p1.res = 5
    t.players.p1.hand = [hit(5)]
    expect(ignite(resolveTurn(t, { p1: 'strike', p2: 'charge' }))).toBeUndefined()
  })
  it('Ignite put on this turn burns 1% Max HP per stack at the end of this turn and the next 2', () => {
    let s = game('MG:1')
    s.players.p2.maxHp = 200
    s.players.p1.res = 1
    s.players.p1.hand = [skill(0)]
    const hp = s.players.p2.hp
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    for (let i = 0; i < 3; i++) s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(hp - s.players.p2.hp).toBe(6) // 3 burns of 2 (1% of 200), none on the 4th turn
    expect(ignite(s)).toBeUndefined()
  })
  it('heals are cut by 25% while Ignited', () => {
    const s = game('MG:1')
    s.players.p2.hp = 50
    s.players.p2.statuses.push({ kind: 'ignite', turns: 3, n: 1 })
    expect(heal(s, 'p2', 20)).toBe(15)
  })
  it('Molten Shield: Block spends up to 3 Mana for Shield 5 each, and each blocked hit Ignites the attacker', () => {
    const s = game('MG:1')
    s.players.p1.res = 4
    s.players.p2.hand = [hit(10), hit(10), hit(12)]
    const n = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(n.players.p1.hp).toBe(100) // 3rd hit 12 soaked by Shield 15
    expect(n.players.p1.res).toBe(2) // 4 − 3 + 1 for Blocking
    expect(ignite(n)?.n).toBe(2)
    expect(shield(n)).toBe(0) // this turn only
  })
})

describe('Mana Barrier', () => {
  it('starts with Shield 30 that soaks hits until used up', () => {
    let s = game('MG:2')
    expect(shield(s)).toBe(30)
    s.players.p2.hand = [hit(20)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect([s.players.p1.hp, shield(s)]).toEqual([100, 10])
    s.players.p2.hand = [hit(20)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect([s.players.p1.hp, shield(s)]).toEqual([90, 0])
  })
  it('Block tops the Shield up to 8 for 2 turns', () => {
    let s = game('MG:2')
    s.players.p1.statuses = []
    s = resolveTurn(s, { p1: 'block', p2: 'charge' })
    expect(shield(s)).toBe(8)
    s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(shield(s)).toBe(8)
    s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(shield(s)).toBe(0)
  })
})

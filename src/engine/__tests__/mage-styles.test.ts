// Mage Styles: Mana Flow (MG:1) and Mana Barrier (MG:2).
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Mage with a Style, p2 = plain opponent
const game = (style: string): GameState =>
  createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
const shield = (s: GameState) => s.players.p1.statuses.filter((x) => x.kind === 'shield').reduce((t, x) => t + (x.n ?? 0), 0)

describe('Mana Flow', () => {
  it('Charge draws 2', () => {
    expect(resolveTurn(game('MG:1'), { p1: 'charge', p2: 'block' }).players.p1.hand).toHaveLength(2)
  })
  it('a broken Charge on an empty Field draws 1, not 2', () => {
    const s = game('MG:1')
    s.players.p2.hand = [hit(1)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hand).toHaveLength(1)
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

// Arcade final boss (engine/boss.ts): one HP bar, a new form at each line.
import { describe, expect, it } from 'vitest'
import { bossSetup, createGame, resolveTurn, shiftLine } from '../index'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deckOf = (c: string) => Array.from({ length: 10 }, (_, i): CardDef => ({ id: `${c}-${i}`, type: 'P', dmg: 1, effectText: '' }))
const FORMS = ['TK', 'BR', 'AS', 'MG'].map((c, i) => ({ championId: c, style: i === 3 ? 'MG:1' : undefined, deck: deckOf(c) }))

// p1 = a plain attacker, p2 = the boss at 200 HP (lines at 150 / 100 / 50)
function game(): GameState {
  const s = createGame({ championId: 'XX', hpStart: 100, hpMax: 100, deck: deckOf('XX') }, bossSetup('Chimera', FORMS, 200, 2), { seed: 1, rules: { resources: false } })
  s.players.p2.hand = [hit(0)]
  return s
}

describe('Arcade boss', () => {
  it('starts in its first form with one HP bar', () => {
    const g = game()
    expect(g.players.p2.championId).toBe('TK')
    expect(g.players.p2.hp).toBe(200)
    expect(g.players.p2.boss?.at).toBe(0)
    expect([0, 1, 2].map((at) => shiftLine(200, 4, at))).toEqual([150, 100, 50])
  })

  it('stays in form above the line', () => {
    const g = game()
    g.players.p1.hand = [hit(49)]
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(151)
    expect(s.players.p2.championId).toBe('TK')
  })

  it('past the line: next form, a fresh deck, its old Field gone and 2 new cards drawn', () => {
    const g = game()
    g.players.p1.hand = [hit(50)]
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    const b = s.players.p2
    expect(b.hp).toBe(150)
    expect(b.championId).toBe('BR')
    expect(b.boss?.at).toBe(1)
    expect(b.hand).toHaveLength(2)
    expect([...b.hand, ...b.deck].every((c) => c.def.id.startsWith('BR-'))).toBe(true)
    expect(s.events?.some((e) => e.k === 'shift' && e.championId === 'BR')).toBe(true)
    expect(s.events?.some((e) => e.k === 'discard' && e.reason === 'Form shift')).toBe(true)
  })

  it('one shift a turn, even past two lines; the last form never shifts', () => {
    const g = game()
    g.players.p1.hand = [hit(120)]
    let s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.championId).toBe('BR')
    s = resolveTurn(s, { p1: 'charge', p2: 'block' })
    expect(s.players.p2.championId).toBe('AS')
    s.players.p2.hp = 10
    s = resolveTurn(s, { p1: 'charge', p2: 'block' })
    expect(s.players.p2.championId).toBe('MG')
    expect(s.players.p2.style).toBe('MG:1')
    s = resolveTurn(s, { p1: 'charge', p2: 'block' })
    expect(s.players.p2.boss?.at).toBe(3)
  })

  it('a K.O. ends the match instead of shifting', () => {
    const g = game()
    g.players.p1.hand = [hit(250)]
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.winner).toBe('p1')
    expect(s.players.p2.championId).toBe('TK')
  })
})

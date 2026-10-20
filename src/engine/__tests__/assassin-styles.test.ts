// Assassin Styles: Sonic Bliz (AS:1) and Fatal Rhythm (AS:2).
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Assassin with a Style, p2 = target at 100 HP
function game(style: string, mine: CardInst[], theirs: CardInst[] = []): GameState {
  const s = createGame({ championId: 'AS', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = mine
  s.players.p2.hand = theirs
  return s
}
const field = (n: number) => Array.from({ length: n }, () => hit(0))

describe('Sonic Bliz Acceleration', () => {
  it('Strike meets Strike: Energy refills to 3 and you draw 2 at the end of the turn', () => {
    const g = game('AS:1', [hit(2)], [hit(1)])
    g.players.p1.res = 0
    const s = resolveTurn(g, { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.res).toBe(3)
    expect(s.players.p1.hand).toHaveLength(2)
    expect(s.players.p2.hand).toHaveLength(0) // the opponent has no Acceleration
  })

  it('no Extra Hits any more, and nothing when only one side Strikes', () => {
    const g = game('AS:1', [hit(2), hit(2), hit(2)], field(4))
    g.players.p1.res = 0
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(94)
    expect(s.players.p1.res).toBe(1)
    expect(s.players.p1.hand).toHaveLength(0)
  })
})

describe('Fatal Rhythm', () => {
  it('the 4th attack is a Critical: 3x dmg, shown with its total dmg in the log', () => {
    const s = resolveTurn(game('AS:2', [hit(2), hit(2), hit(2), hit(4), hit(2)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 8 - 12)
    expect(s.log.some((l) => l.includes('slot 4') && l.includes('hits 12') && l.includes('Critical'))).toBe(true)
  })

  it('counts across turns, blocked attacks included', () => {
    let s = game('AS:2', [hit(2), hit(2), hit(2)])
    s = resolveTurn(s, { p1: 'strike', p2: 'block' }) // attacks 1–3, first 2 blocked
    expect(s.players.p2.hp).toBe(98)
    s.players.p1.hand = [hit(5), hit(2), hit(2), hit(2), hit(2)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' }) // attacks 4 (x3), 5, 6, 7, 8 (x3)
    expect(s.players.p2.hp).toBe(98 - 15 - 2 - 2 - 2 - 6)
    expect(s.players.p1.styleData?.attacks).toBe(8)
  })

  it('a blocked Critical still deals 50%, other blocked hits deal 0', () => {
    const s = resolveTurn(game('AS:2', [hit(2), hit(2), hit(2), hit(4)]), { p1: 'strike', p2: 'block' })
    // hits 1–2 blocked (0), hit 3 lands 2; hit 4 is Critical 12 but not blocked (Block stops first 2)
    expect(s.players.p2.hp).toBe(100 - 2 - 12)
    const b = game('AS:2', [hit(2), hit(2), hit(2)])
    b.players.p1.styleData = { attacks: 2 } // this chain is attacks 3, 4, 5 → slot 2 is the Critical
    const r = resolveTurn(b, { p1: 'strike', p2: 'block' })
    // slot 1 blocked 0, slot 2 Critical 6 blocked → 3, slot 3 lands 2
    expect(r.players.p2.hp).toBe(100 - 3 - 2)
    expect(r.log.some((l) => l.includes('Critical through 3'))).toBe(true)
  })

  it('Critical is x4 while the enemy HP is red (below 30% of Max HP)', () => {
    let s = game('AS:2', [hit(2), hit(2), hit(2), hit(4)])
    s.players.p2.hp = 29
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(29 - 6 - 16)
    expect(s.log.some((l) => l.includes('x4'))).toBe(true)
    let t = game('AS:2', [hit(2), hit(2), hit(2), hit(4)])
    t.players.p2.hp = 30
    t = resolveTurn(t, { p1: 'strike', p2: 'charge' })
    expect(t.players.p2.hp).toBe(30 - 6 - 12)
  })
})

describe('Sonic Bliz start', () => {
  it('starts the game with 3 cards on the Field; other Styles start empty', () => {
    const mk = (style: string) => createGame({ championId: 'AS', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
    expect(mk('AS:1').players.p1.hand).toHaveLength(3)
    expect(mk('AS:2').players.p1.hand).toHaveLength(0)
  })
})


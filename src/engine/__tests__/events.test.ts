import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardInst, CardType, GameState } from '../index'

let uid = 0
const vanilla = (dmg: number, type: CardType = 'P'): CardInst => ({ uid: `e${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 20 }, (_, i) => ({ id: `XX-${i}`, type: 'P' as const, dmg: 1, effectText: '' }))

function setup(p1Hand: CardInst[], p2Hand: CardInst[]): GameState {
  const champ = { championId: 'XX', hpStart: 100, hpMax: 150, deck }
  const s = createGame(champ, champ, { seed: 1, rules: { resources: false } })
  s.players.p1.hand = p1Hand
  s.players.p2.hand = p2Hand
  return s
}

describe('turn events for the battle screen', () => {
  it('Strike vs Block: blocked hits, landed hits with their HP change, then the chain goes back to the deck', () => {
    const chain = [vanilla(5), vanilla(5), vanilla(7)]
    const n = resolveTurn(setup(chain, [vanilla(1)]), { p1: 'strike', p2: 'block' })
    expect(n.events!.map((e) => e.k)).toEqual(['hit', 'hit', 'hit', 'hp', 'sweep'])
    const hits = n.events!.filter((e) => e.k === 'hit')
    expect(hits.map((h) => h.k === 'hit' && h.blocked)).toEqual([true, true, false])
    expect(n.events![3]).toEqual({ k: 'hp', side: 'p2', delta: -7 })
    expect(n.events![4]).toEqual({ k: 'sweep', side: 'p1', uids: chain.map((c) => c.uid) })
  })

  it('Strike vs Charge: the charge break shows as a discard followed by the replacement draw', () => {
    const oldest = vanilla(2)
    const n = resolveTurn(setup([vanilla(3)], [oldest, vanilla(4)]), { p1: 'strike', p2: 'charge' })
    const kinds = n.events!.map((e) => e.k)
    expect(kinds).toEqual(['hit', 'hp', 'sweep', 'discard', 'draw'])
    expect(n.events![3]).toEqual({ k: 'discard', side: 'p2', uid: oldest.uid, reason: 'Charge break' })
  })

  it('events hold only the last turn', () => {
    const s = setup([], [])
    const a = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    const b = resolveTurn(a, { p1: 'block', p2: 'block' })
    expect(a.events!.map((e) => e.k)).toEqual(['draw', 'draw'])
    expect(b.events).toEqual([])
  })
})

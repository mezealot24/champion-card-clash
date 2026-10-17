// Assassin Energy Surge (Q 2026-10-17): a full Energy bar is spent by the action you pick.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const card = (dmg: number, type: 'P' | 'K' | 'S' = 'P'): CardInst => ({ uid: `e${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Assassin with a full bar (3) unless res says otherwise
function game(mine: CardInst[], theirs: CardInst[], res = 3, style?: string): GameState {
  const s = createGame({ championId: 'AS', hpStart: 50, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = mine
  s.players.p2.hand = theirs
  s.players.p1.res = res
  return s
}

describe('Energy Surge', () => {
  it('Charge: spends all Energy, draws 1 more (2 cards); not with a bar short of full', () => {
    let s = resolveTurn(game([], []), { p1: 'charge', p2: 'block' })
    expect(s.players.p1.hand).toHaveLength(2)
    expect(s.players.p1.res).toBe(1) // spent, then +1 at the end of the turn
    expect(s.log.some((l) => l.includes('Energy Surge'))).toBe(true)
    s = resolveTurn(game([], [], 2), { p1: 'charge', p2: 'block' })
    expect(s.players.p1.hand).toHaveLength(1)
    expect(s.players.p1.res).toBe(3)
  })

  it('Charge broken by a Strike still draws the extra card', () => {
    const s = resolveTurn(game([card(1), card(1)], [card(1)]), { p1: 'charge', p2: 'strike' })
    // lost slot 1 and drew 1 (Charge break) + 1 (Surge)
    expect(s.players.p1.hand).toHaveLength(3)
  })

  it('Block: spends all Energy, heals 3 per Energy', () => {
    const s = resolveTurn(game([], []), { p1: 'block', p2: 'block' })
    expect(s.players.p1.hp).toBe(59)
    expect(s.players.p1.res).toBe(1)
  })

  it('Strike with no S on the Field: enemy S cards deal 0, nothing reflected; P/K still hit', () => {
    const s = resolveTurn(game([card(2)], [card(10, 'S'), card(4, 'K')]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(50 - 4)
    expect(s.players.p2.hp).toBe(98)
    expect(s.players.p1.res).toBe(1)
  })

  it('Strike with an S on the Field: no Surge, Energy kept for the S card', () => {
    const s = resolveTurn(game([card(2, 'S')], [card(10, 'S')]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(40)
    expect(s.log.some((l) => l.includes('Energy Surge'))).toBe(false)
  })

  it('Sonic Bliz: Overdrive and the S ward share the same full bar', () => {
    const s = resolveTurn(game([card(1), card(1), card(1)], [card(10, 'S')], 3, 'AS:1'), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(50) // S card warded
    expect(s.players.p2.hp).toBe(100 - 3 * 7) // Overdrive +6 per card
  })
})

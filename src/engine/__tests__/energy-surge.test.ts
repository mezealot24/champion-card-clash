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
  it('Block (Wraith Step): hits past Block deal 1 each; spends the full bar', () => {
    const s = resolveTurn(game([], [card(5), card(5), card(20), card(9)]), { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(50 - 2)
    expect(s.players.p1.res).toBe(1) // spent, then +1 at the end of the turn
  })

  it('no Surge with a bar short of full', () => {
    const s = resolveTurn(game([], [card(5), card(5), card(20)], 2), { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(30)
    expect(s.log.some((l) => l.includes('Energy Surge'))).toBe(false)
  })

  it('Charge (Shroud): no Charge break, hits land in full, draws the Style extra', () => {
    const s = resolveTurn(game([card(1), card(1)], [card(9), card(4)]), { p1: 'charge', p2: 'strike' })
    expect(s.players.p1.hand).toHaveLength(3) // kept both, drew 1 (no Style)
    expect(s.players.p1.hp).toBe(50 - 9 - 4)
  })

  it('Sonic Bliz Shroud draws more; Wraith Step does not', () => {
    const charge = resolveTurn(game([card(1)], [card(9)], 3, 'AS:1'), { p1: 'charge', p2: 'strike' })
    expect(charge.players.p1.hand).toHaveLength(1 + 1 + 1) // kept, Charge draw, Shroud draw
    const block = resolveTurn(game([card(1)], [card(9)], 3, 'AS:1'), { p1: 'block', p2: 'strike' })
    expect(block.players.p1.hand).toHaveLength(1)
    expect(block.players.p1.hp).toBe(50) // Block stops it
  })

  it('Fatal Rhythm Shroud moves the Critical counter, never past the next Critical', () => {
    const s = game([], [], 3, 'AS:2')
    s.players.p1.styleData = { attacks: 0 }
    expect(resolveTurn(s, { p1: 'charge', p2: 'charge' }).players.p1.styleData?.attacks).toBe(2)
    const near = game([], [], 3, 'AS:2')
    near.players.p1.styleData = { attacks: 2 }
    expect(resolveTurn(near, { p1: 'charge', p2: 'charge' }).players.p1.styleData?.attacks).toBe(3) // next attack still crits
  })

  it('Strike: no Surge, Energy is kept', () => {
    const s = resolveTurn(game([card(2)], [card(10, 'S')]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(40)
    expect(s.log.some((l) => l.includes('Energy Surge'))).toBe(false)
  })
})

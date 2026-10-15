// Assassin Styles: Sonic Bliz (AS:1) and Coup de grâce (AS:2).
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

describe('Sonic Bliz', () => {
  it('3 clean hits: one extra hit per opponent card, each = chain length', () => {
    // chain 3 x 2 dmg = 6, then 4 extra hits x 3 dmg = 12
    expect(resolveTurn(game('AS:1', [hit(2), hit(2), hit(2)], field(4)), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 6 - 12)
  })

  it('needs 3 clean hits in the chain', () => {
    // Block stops the first 2, only 2 of 4 land clean
    expect(resolveTurn(game('AS:1', [hit(2), hit(2), hit(2), hit(2)], field(3)), { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(96)
    // 0-dmg hits are not clean
    expect(resolveTurn(game('AS:1', [hit(2), hit(2), hit(0)], field(3)), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(96)
  })

  it('5 blocked-through chain: hits 3–5 clean → extra hits', () => {
    expect(resolveTurn(game('AS:1', [hit(1), hit(1), hit(1), hit(1), hit(1)], field(2)), { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(100 - 3 - 2 * 5)
  })
})

describe('Coup de grâce', () => {
  it('the 5th attack deals 3x', () => {
    expect(resolveTurn(game('AS:2', [hit(2), hit(2), hit(2), hit(2), hit(4)]), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 8 - 12)
  })

  it('counts across turns, blocked attacks included', () => {
    let s = game('AS:2', [hit(2), hit(2), hit(2)])
    s = resolveTurn(s, { p1: 'strike', p2: 'block' }) // attacks 1–3, first 2 blocked
    expect(s.players.p2.hp).toBe(98)
    s.players.p1.hand = [hit(2), hit(5), hit(2)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' }) // attacks 4, 5 (x3), 6
    expect(s.players.p2.hp).toBe(98 - 2 - 15 - 2)
    expect(s.players.p1.styleData?.attacks).toBe(6)
  })
})

describe('Sonic Bliz extra hits', () => {
  it('count as hit dmg for the opponent\'s "you take N+ dmg" cards', () => {
    const watcher: CardInst = { uid: 'w', def: { id: 'XX-W', type: 'P', dmg: 1, effectText: '', effectSpec: [{ hook: 'onResolve', if: [{ c: 'tookDmg', n: 15 }], do: [{ a: 'heal', who: 'self', n: 50 }] }] } }
    // chain 3 x 2 = 6 dmg, + 3 extra hits x 3 = 9 → 15 taken → watcher heals 50 (capped at 100)
    const s = resolveTurn(game('AS:1', [hit(2), hit(2), hit(2)], [watcher, hit(0), hit(0)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100)
  })
})

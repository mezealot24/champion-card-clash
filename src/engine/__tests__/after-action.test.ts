// Q 2026-10-15: After action fires at the end of the turn for every card on the Field, whatever action was picked.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, EffectSpec, GameState } from '../index'

let uid = 0
const card = (spec: EffectSpec, dmg = 5): CardInst => ({ uid: `c${uid++}`, def: { id: 'AA-001', type: 'K', dmg, effectText: '', effectSpec: spec } })
const plain = (dmg = 1): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(p1: CardInst[], p2: CardInst[] = []): GameState {
  const s = createGame({ championId: 'AA', hpStart: 50, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}

const heal5: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'heal', who: 'self', n: 5 }] }]
const heal5OnStrike: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'heal', who: 'self', n: 5 }] }]

describe('After action', () => {
  it('fires whatever action we pick', () => {
    for (const a of ['strike', 'block', 'charge'] as const) {
      expect(resolveTurn(game([card(heal5)]), { p1: a, p2: 'block' }).players.p1.hp, a).toBe(55)
    }
  })

  it('"you play Strike" keeps it to turns we attack', () => {
    expect(resolveTurn(game([card(heal5OnStrike)]), { p1: 'block', p2: 'block' }).players.p1.hp).toBe(50)
    expect(resolveTurn(game([card(heal5OnStrike)]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(55)
  })

  it('fires after every hit of the turn (sees the whole turn)', () => {
    // we Strike first in slot 1, the opponent's 2 hits land after: the condition still sees them
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'tookDmg', n: 6 }], do: [{ a: 'heal', who: 'self', n: 10 }] }]
    expect(resolveTurn(game([card(spec, 1)], [plain(3), plain(3)]), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(50 - 6 + 10)
  })

  it('a held card is never "hit clean" or "blocked"', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'hitResult', r: 'blocked' }], do: [{ a: 'draw', who: 'self', n: 1 }] }]
    expect(resolveTurn(game([card(spec)]), { p1: 'block', p2: 'block' }).players.p1.hand).toHaveLength(1)
    expect(resolveTurn(game([card(spec)]), { p1: 'strike', p2: 'block' }).players.p1.hand).toHaveLength(1)
  })
})

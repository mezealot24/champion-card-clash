// Q 2026-10-17: "On hit" fires right after the card's own hit, between hits, so a heal isn't wasted on a lethal turn.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { describeSpec } from '../effects/describe'
import type { CardDef, CardInst, EffectSpec, GameState } from '../index'

let uid = 0
const card = (spec: EffectSpec, dmg = 5): CardInst => ({ uid: `c${uid++}`, def: { id: 'AA-001', type: 'K', dmg, effectText: '', effectSpec: spec } })
const plain = (dmg = 1): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 at 10/100 HP
function game(p1: CardInst[], p2: CardInst[] = []): GameState {
  const s = createGame({ championId: 'AA', hpStart: 10, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}

const healOnHit: EffectSpec = [{ hook: 'onHit', do: [{ a: 'heal', who: 'self', n: 8 }] }]
const healAfter: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'heal', who: 'self', n: 8 }] }]

describe('On hit', () => {
  it('heals between hits, so it can keep you alive through the enemy chain', () => {
    // p1 slot 1 hits and heals 8 (10 → 18), then enemy slot 1 (6) and slot 2 (6): 18 − 12 = 6, still alive
    const s = resolveTurn(game([card(healOnHit)], [plain(6), plain(6)]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(6)
    expect(s.winner).toBeNull()
  })

  it('the same heal as After action comes too late: 10 − 12 is lethal', () => {
    const s = resolveTurn(game([card(healAfter)], [plain(6), plain(6)]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(0)
    expect(s.winner).toBe('p2')
  })

  it('a later slot heals only after the enemy hits before it', () => {
    // enemy slot 1 hits for 12 first (p1 to 0) before p1 slot 2 heals: 0 HP stays down
    const s = resolveTurn(game([plain(1), card(healOnHit)], [plain(12)]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(0)
    expect(s.winner).toBe('p2')
  })

  it('knows its own hit result', () => {
    const spec: EffectSpec = [{ hook: 'onHit', if: [{ c: 'hitResult', r: 'blocked' }], do: [{ a: 'heal', who: 'self', n: 5 }] }]
    expect(resolveTurn(game([card(spec)]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(15)
    expect(resolveTurn(game([card(spec)]), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(10)
  })

  it('never fires when you do not Strike', () => {
    for (const a of ['block', 'charge'] as const) expect(resolveTurn(game([card(healOnHit)]), { p1: a, p2: 'block' }).players.p1.hp, a).toBe(10)
  })

  it('reads as "On hit" in card text', () => {
    expect(describeSpec(healOnHit)).toBe('On hit: Gain 8 HP')
  })
})

import { describe, expect, it } from 'vitest'
import { createGame, isEffectMissing, resolveTurn } from '../index'
import { describeSpec } from '../effects/describe'
import type { CardDef, CardInst, EffectSpec } from '../index'

let uid = 0
const inst = (def: CardDef): CardInst => ({ uid: `s${uid++}`, def })
const plain = (dmg: number): CardInst => inst({ id: 'XX-000', type: 'P', dmg, effectText: '' })

function game(p1: CardInst[], p2: CardInst[]) {
  const deck = Array.from({ length: 10 }, (_, i) => ({ id: `XX-${i}`, type: 'P' as const, dmg: 1, effectText: '' }))
  const s = createGame(
    { championId: 'XX', hpStart: 50, hpMax: 100, deck },
    { championId: 'XX', hpStart: 100, hpMax: 100, deck },
    { seed: 3 },
  )
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}

describe('effect_json', () => {
  it('runs if/do rules on the right hook', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'enemyHandAtLeast', n: 2 }], do: [{ a: 'heal', who: 'self', n: 10 }] }]
    const card = inst({ id: 'ZZ-001', type: 'K', dmg: 8, effectText: 'ถ้าศัตรูมี ≥2 ใบ: ฮีล 10', effectSpec: spec })
    expect(resolveTurn(game([card], [plain(1), plain(1)]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(60)
    expect(resolveTurn(game([card], [plain(1)]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(50)
  })

  it('modify rules change dmg before hits', () => {
    const spec: EffectSpec = [{ hook: 'modify', do: [{ a: 'addDmg', target: 'following', n: 3, onlyType: 'P' }] }]
    const card = inst({ id: 'ZZ-002', type: 'K', dmg: 2, effectText: 'Punch ที่ตามหลัง +3', effectSpec: spec })
    const n = resolveTurn(game([card, plain(1), plain(1)], []), { p1: 'strike', p2: 'charge' })
    expect(n.players.p2.hp).toBe(100 - 2 - 4 - 4)
  })

  it('JSON beats code, and counts as implemented', () => {
    expect(isEffectMissing('ZZ-003', 'ข้อความ')).toBe(true)
    expect(isEffectMissing('ZZ-003', 'ข้อความ', [{ hook: 'onClean', do: [{ a: 'draw', who: 'self', n: 1 }] }])).toBe(false)
    const override = inst({ id: 'BR-001', type: 'K', dmg: 16, effectText: '', effectSpec: [{ hook: 'onResolve', do: [] }] })
    expect(resolveTurn(game([override], []), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(50) // no self-damage
  })

  it('onHeld fires for each held copy, only when we Block', () => {
    const spec: EffectSpec = [{ hook: 'onHeld', if: [{ c: 'selfAction', a: 'block' }], do: [{ a: 'heal', who: 'self', n: 5 }] }]
    const card = () => inst({ id: 'ZZ-004', type: 'P', dmg: 4, effectText: 'ถ้าเรา Block: ฮีล 5', effectSpec: spec })
    expect(resolveTurn(game([card(), card()], []), { p1: 'block', p2: 'charge' }).players.p1.hp).toBe(60)
    expect(resolveTurn(game([card()], []), { p1: 'charge', p2: 'charge' }).players.p1.hp).toBe(50)
    // Strike takes the card out of the hand, so it does not count as held
    expect(resolveTurn(game([card()], []), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(50)
  })

  it('After attack + hit result works like the legacy onClean / onBlocked hooks', () => {
    const legacy: EffectSpec = [{ hook: 'onClean', do: [{ a: 'heal', who: 'self', n: 5 }] }]
    const modern: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'hitResult', r: 'clean' }], do: [{ a: 'heal', who: 'self', n: 5 }] }]
    for (const spec of [legacy, modern]) {
      const card = () => inst({ id: 'ZZ-005', type: 'P', dmg: 4, effectText: 'x', effectSpec: spec })
      expect(resolveTurn(game([card()], []), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(55)
      expect(resolveTurn(game([card()], []), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(50)
    }
    expect(describeSpec(legacy)).toBe('After attack, if this card hits clean: Gain 5 HP')
  })

  it('grow: After attack, if opponent played Block, this card gains +30 dmg for good', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'enemyAction', a: 'block' }], do: [{ a: 'grow', n: 30, dur: 'game' }] }]
    const card = inst({ id: 'ZZ-006', type: 'K', dmg: 10, effectText: 'x', effectSpec: spec })
    const s1 = resolveTurn(game([card], []), { p1: 'strike', p2: 'block' })
    expect(s1.players.p2.hp).toBe(100) // blocked, but it grew
    const grown = s1.players.p1.deck.find((c) => c.uid === card.uid)!
    expect(grown.grow).toBe(30)
    const s2 = resolveTurn({ ...s1, players: { ...s1.players, p1: { ...s1.players.p1, hand: [grown] } } }, { p1: 'strike', p2: 'charge' })
    expect(s2.players.p2.hp).toBe(60)
  })

  it('grow for next attack only wears off after one attack', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'enemyAction', a: 'block' }], do: [{ a: 'grow', n: 30, dur: 'next' }] }]
    const card = inst({ id: 'ZZ-007', type: 'K', dmg: 10, effectText: 'x', effectSpec: spec })
    const withHand = (st: ReturnType<typeof game>, c: CardInst) => ({ ...st, players: { ...st.players, p1: { ...st.players.p1, hand: [c] } } })
    const s1 = resolveTurn(game([card], []), { p1: 'strike', p2: 'block' })
    const c1 = s1.players.p1.deck.find((c) => c.uid === card.uid)!
    expect(c1.growNext).toBe(30)
    const s2 = resolveTurn(withHand(s1, c1), { p1: 'strike', p2: 'charge' })
    expect(s2.players.p2.hp).toBe(60)
    const c2 = s2.players.p1.deck.filter((c) => c.uid === card.uid).at(-1)!
    expect(c2.growNext).toBeUndefined()
  })

  it('BR-002 mind game: buff builds in hand while the opponent Blocks, cashed in on Strike', () => {
    const spec: EffectSpec = [{ hook: 'onHeld', if: [{ c: 'enemyAction', a: 'block' }], do: [{ a: 'grow', n: 30, dur: 'next' }] }]
    const br2 = inst({ id: 'BR-002', type: 'K', dmg: 10, effectText: 'x', effectSpec: spec })
    let s = game([br2], [])
    s = resolveTurn(s, { p1: 'charge', p2: 'block' }) // +30, and p1 draws
    s = resolveTurn(s, { p1: 'charge', p2: 'block' }) // +30 again
    expect(s.players.p1.hand.find((c) => c.uid === br2.uid)!.growNext).toBe(60)
    const hp = s.players.p2.hp
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(hp - s.players.p2.hp).toBe(70 + 1 + 1) // BR-002 70 + the two 1-dmg filler draws
    expect(s.players.p1.deck.find((c) => c.uid === br2.uid)!.growNext).toBeUndefined()
  })
})

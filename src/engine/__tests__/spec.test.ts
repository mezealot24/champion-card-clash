import { describe, expect, it } from 'vitest'
import { createGame, isEffectMissing, resolveTurn } from '../index'
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
})

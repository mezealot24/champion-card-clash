// Q 2026-10-25: Bruiser card pass needs noFacing, lostHp, per missingHp5 and an addDmg cap.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'
import type { EffectSpec } from '../effects/spec'

let uid = 0
const card = (dmg: number, effect?: EffectSpec): CardInst => ({ uid: `c${uid++}`, def: { id: `CX-${uid}`, type: 'P', dmg, effectText: '', effectSpec: effect } })
const deck = Array.from({ length: 12 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'K', dmg: 1, effectText: '' }))
const game = (): GameState => {
  const s = createGame({ championId: 'XX', hpStart: 100, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = []
  s.players.p2.hand = []
  return s
}
const strike = { a: 'strike', c: 'selfAction' } as const

describe('Bruiser card conditions (2026-10-25)', () => {
  it('noFacing: +6 only with no enemy card in the slot', () => {
    let s = game()
    s.players.p1.hand = [card(14, [{ hook: 'modify', if: [strike, { c: 'noFacing' }], do: [{ a: 'addDmg', n: 6, target: 'this' }] }])]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(80)
  })

  it('lostHp: true the turn after you lost HP', () => {
    let s = game()
    s.players.p2.hand = [card(5)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    s.players.p1.hand = [card(14, [{ hook: 'modify', if: [strike, { c: 'lostHp' }], do: [{ a: 'addDmg', n: 12, target: 'this' }] }])]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(74) // hit last turn: +12
    const hp = s.players.p2.hp
    s.players.p1.hand = [card(14, [{ hook: 'modify', if: [strike, { c: 'lostHp' }], do: [{ a: 'addDmg', n: 12, target: 'this' }] }])]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(hp - s.players.p2.hp).toBe(14) // no HP lost last turn: no bonus
  })

  it('per missingHp5 with a cap', () => {
    let s = game()
    s.players.p1.hp = 10 // 90 missing → 18, cap 15
    s.players.p1.hand = [card(35, [{ hook: 'modify', if: [strike], do: [{ a: 'addDmg', n: 1, target: 'this', per: 'missingHp5', max: 15 }] }])]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(50)
  })
})

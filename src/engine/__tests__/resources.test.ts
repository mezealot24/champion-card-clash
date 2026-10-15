// Class resources + S card costs (Q 2026-10-15) and the "wow" building blocks: Pierce, Steal, Gain resource.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

let uid = 0
const c = (type: CardType, dmg = 10, effectSpec?: EffectSpec, cost?: number): CardInst => ({
  uid: `r${uid++}`,
  def: { id: `XX-${type}`, type, dmg, effectText: '', effectSpec, cost },
})
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
const heal5: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'heal', who: 'self', n: 5 }] }]

function game(champ: string, mine: CardInst[], theirs: CardInst[] = [], res?: number): GameState {
  const s = createGame({ championId: champ, hpStart: 50, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = mine
  s.players.p2.hand = theirs
  if (res !== undefined) s.players.p1.res = res
  return s
}

describe('resources', () => {
  it('start values: Assassin starts full (3), Mage / Bruiser at 0', () => {
    expect(game('AS', []).players.p1.res).toBe(3)
    expect(game('MG', []).players.p1.res).toBe(0)
    expect(game('BR', []).players.p1.res).toBe(0)
  })

  it('Mage gains 1 Mana on Charge or Block, none on Strike, cap 5', () => {
    expect(resolveTurn(game('MG', []), { p1: 'charge', p2: 'block' }).players.p1.res).toBe(1)
    expect(resolveTurn(game('MG', [], [], 5), { p1: 'block', p2: 'block' }).players.p1.res).toBe(5)
    expect(resolveTurn(game('MG', [c('P')], [], 2), { p1: 'strike', p2: 'block' }).players.p1.res).toBe(2)
  })

  it('Bruiser gains Rage per hit taken and per clean hit landed, loses 1 on a quiet turn', () => {
    // takes 2 hits, lands 1 clean
    const s = resolveTurn(game('BR', [c('P')], [c('P'), c('K')]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.res).toBe(3)
    expect(resolveTurn(game('BR', [], [], 3), { p1: 'block', p2: 'charge' }).players.p1.res).toBe(2)
  })

  it('Assassin gains 1 Energy every turn', () => {
    expect(resolveTurn(game('AS', [], [], 1), { p1: 'block', p2: 'charge' }).players.p1.res).toBe(2)
  })

  it('an S card pays its cost and its effect fires', () => {
    const s = resolveTurn(game('MG', [c('S', 10, heal5, 2)], [], 3), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.res).toBe(1)
    expect(s.players.p1.hp).toBe(55)
  })

  it("can't pay: the S card still hits but its effect is off", () => {
    const s = resolveTurn(game('MG', [c('S', 10, heal5, 2)], [], 1), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.res).toBe(1)
    expect(s.players.p1.hp).toBe(50)
    expect(s.players.p2.hp).toBe(90)
  })

  it('pays in chain order: the later S card goes unpaid when the bar runs out', () => {
    const s = resolveTurn(game('AS', [c('S', 1, heal5, 2), c('S', 1, heal5, 2)], [], 3), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hp).toBe(55) // only the first heal
    expect(s.players.p1.res).toBe(2) // 3 − 2 paid, +1 end of turn
  })

  it('an S card with no cost set uses the class default; P / K are free', () => {
    const s = resolveTurn(game('MG', [c('P', 1, heal5), c('S', 1, heal5)], [], 2), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.res).toBe(0) // Mage default 2
    expect(s.players.p1.hp).toBe(60)
  })

  it('Tank pays in HP, never down to 0', () => {
    const s = resolveTurn(game('TK', [c('S', 10, heal5)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hp).toBe(45) // 50 − 10 cost + 5 heal
    const low = game('TK', [c('S', 10, heal5)])
    low.players.p1.hp = 10
    expect(resolveTurn(low, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(10) // can't pay, no heal
  })

  it('resources off = every card is free', () => {
    const s = createGame({ championId: 'MG', hpStart: 50, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1, rules: { resources: false } })
    s.players.p1.hand = [c('S', 1, heal5, 5)]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(55)
  })
})

describe('wow building blocks', () => {
  it('Pierce: this card ignores Block', () => {
    const pierce: EffectSpec = [{ hook: 'modify', do: [{ a: 'pierce', target: 'this' }] }]
    const s = resolveTurn(game('AS', [c('P', 10), c('S', 20, pierce)]), { p1: 'strike', p2: 'block' })
    expect(s.players.p2.hp).toBe(80)
  })

  it('Steal: takes the opponent card in the same slot; it goes back to its owner after use', () => {
    const steal: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'steal' }] }]
    const loot = c('K', 7)
    let s = resolveTurn(game('AS', [c('S', 1, steal)], [loot]), { p1: 'strike', p2: 'block' })
    expect(s.players.p1.hand.map((x) => x.uid)).toEqual([loot.uid])
    expect(s.players.p2.hand).toEqual([])
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.deck.some((x) => x.uid === loot.uid)).toBe(true)
    expect(s.players.p1.deck.some((x) => x.uid === loot.uid)).toBe(false)
  })

  it('Gain resource and the "N+ resource" condition', () => {
    const gain: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'gainRes', who: 'self', n: 2 }] }]
    expect(resolveTurn(game('MG', [c('P', 1, gain)]), { p1: 'strike', p2: 'charge' }).players.p1.res).toBe(2)
    const rich: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'res', who: 'self', n: 3 }], do: [{ a: 'heal', who: 'self', n: 5 }] }]
    expect(resolveTurn(game('MG', [c('P', 1, rich)], [], 3), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(55)
    expect(resolveTurn(game('MG', [c('P', 1, rich)], [], 2), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(50)
  })
})

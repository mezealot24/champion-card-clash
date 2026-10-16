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

  it('Bruiser gains 2 Rage per hit taken and 1 per clean hit landed, loses 1 on a quiet turn', () => {
    // takes 2 hits, lands 1 clean
    const s = resolveTurn(game('BR', [c('P')], [c('P'), c('K')]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.res).toBe(5)
    expect(resolveTurn(game('BR', [], [], 3), { p1: 'block', p2: 'charge' }).players.p1.res).toBe(2)
  })

  it('Bruiser: HP lost outside a hit gives Rage, 2 from the opponent, 1 from own drawbacks (Q 2026-10-16)', () => {
    const pain: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'loseHp', who: 'self', n: 3 }] }]
    // lands 2 clean P hits, one of them costs 3 HP: 2 clean + 1 other dmg
    expect(resolveTurn(game('BR', [c('P'), c('P', 10, pain)]), { p1: 'strike', p2: 'charge' }).players.p1.res).toBe(3)
    // quiet turn but an enemy Hold effect burns 4 HP: +2, no −1
    const burn: EffectSpec = [{ hook: 'onHeld', do: [{ a: 'loseHp', who: 'enemy', n: 4 }] }]
    expect(resolveTurn(game('BR', [], [c('K', 5, burn)], 3), { p1: 'block', p2: 'charge' }).players.p1.res).toBe(5)
  })

  it('Bruiser: no −1 on a quiet turn while HP is red (below 30% Max HP)', () => {
    const red = game('BR', [], [], 3)
    red.players.p1.hp = 29
    expect(resolveTurn(red, { p1: 'block', p2: 'charge' }).players.p1.res).toBe(3)
    const notRed = game('BR', [], [], 3)
    notRed.players.p1.hp = 30
    expect(resolveTurn(notRed, { p1: 'block', p2: 'charge' }).players.p1.res).toBe(2)
  })

  it('Bruiser: Rage cap 20; an S card costs 10 by default (Q 2026-10-16 21:50Z), cards.cost can change it', () => {
    expect(resolveTurn(game('BR', [c('P')], [c('P')], 20), { p1: 'strike', p2: 'strike' }).players.p1.res).toBe(20)
    // short of the cost: the S still strikes at half base dmg, effect off; the P is unaffected
    const short = resolveTurn(game('BR', [c('P', 5), c('S', 10, heal5)], [], 9), { p1: 'strike', p2: 'charge' })
    expect([short.players.p1.hp, short.players.p2.hp, short.players.p1.res]).toEqual([50, 90, 11]) // 5 + floor(10/2)
    const full = resolveTurn(game('BR', [c('S', 10, heal5)], [], 10), { p1: 'strike', p2: 'charge' })
    expect([full.players.p1.hp, full.players.p2.hp, full.players.p1.res]).toEqual([55, 90, 1])
    // cost 10 set on the card: 10 Rage is enough
    const ten = resolveTurn(game('BR', [c('S', 10, heal5, 10)], [], 10), { p1: 'strike', p2: 'charge' })
    expect([ten.players.p1.hp, ten.players.p2.hp, ten.players.p1.res]).toEqual([55, 90, 1])
    const tenShort = resolveTurn(game('BR', [c('S', 10, heal5, 10)], [], 9), { p1: 'strike', p2: 'charge' })
    expect([tenShort.players.p1.hp, tenShort.players.p2.hp]).toEqual([50, 95])
  })

  it('Bruiser: unpaid S still fires its drawbacks', () => {
    const pain: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'loseHp', who: 'self', n: 7 }, { a: 'heal', who: 'self', n: 5 }] }]
    const s = resolveTurn(game('BR', [c('S', 10, pain)], [], 5), { p1: 'strike', p2: 'charge' })
    expect([s.players.p1.hp, s.players.p2.hp]).toEqual([43, 95])
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

  it("can't pay: drawbacks still fire, the rest stays off", () => {
    const mixed: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'loseHp', who: 'self', n: 7 }, { a: 'heal', who: 'self', n: 5 }, { a: 'loseHp', who: 'enemy', n: 9 }] }]
    const s = resolveTurn(game('MG', [c('S', 10, mixed, 2)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hp).toBe(43) // lost 7, no heal
    expect(s.players.p2.hp).toBe(90) // only the hit, no extra 9
    const paid = resolveTurn(game('MG', [c('S', 10, mixed, 2)], [], 2), { p1: 'strike', p2: 'charge' })
    expect(paid.players.p1.hp).toBe(48)
    expect(paid.players.p2.hp).toBe(81)
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

describe('discard info for the UI', () => {
  it('Charge break records the lost card for that turn only', () => {
    const a = c('P', 1), b = c('K', 2)
    const g = game('AS', [c('P', 1)], [a, b])
    const t = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(t.players.p2.discarded?.map((d) => [d.card.uid, d.slot, d.reason])).toEqual([[a.uid, 1, 'Charge break']])
    expect(resolveTurn(t, { p1: 'block', p2: 'block' }).players.p2.discarded).toEqual([])
  })
})

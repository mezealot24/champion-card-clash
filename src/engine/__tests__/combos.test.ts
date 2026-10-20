// Signature combos: Tank P>K>P, Assassin P>K>S, Mage S+S+S.
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn } from '../index'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

let uid = 0
const c = (type: CardType, dmg = 2, effectSpec?: EffectSpec): CardInst => ({ uid: `c${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '', effectSpec } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(champ: string, mine: CardInst[], theirs: CardInst[] = [], hp = 100): GameState {
  const s = createGame({ championId: champ, hpStart: hp, hpMax: 200, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1, rules: { resources: false } })
  s.players.p1.hand = mine
  s.players.p2.hand = theirs
  return s
}

describe('Tank P > K > P', () => {
  it('heals 10% of current HP when the opponent blocks one of them', () => {
    expect(resolveTurn(game('TK', [c('P'), c('K'), c('P')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(110)
  })
  it('no heal when nothing is blocked or the types do not match', () => {
    expect(resolveTurn(game('TK', [c('P'), c('K'), c('P')]), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(100)
    expect(resolveTurn(game('TK', [c('S'), c('S'), c('S')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(100)
    expect(resolveTurn(game('TK', [c('P'), c('K'), c('K')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(100)
  })
  it('any order, not in a row (Q 2026-10-16)', () => {
    expect(resolveTurn(game('TK', [c('K'), c('S'), c('P'), c('P')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(110)
  })
})

describe('Assassin P > K > S → Mark of Assassin', () => {
  const mark = { kind: 'deathMark', turns: 9999 }
  it('works in any order: marks the opponent for the rest of the game', () => {
    const s = resolveTurn(game('AS', [c('S'), c('P'), c('K')]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.statuses).toContainEqual(mark)
    expect(s.players.p2.hp).toBe(94) // no burst on the Strike that places the mark
  })
  it('needs all 3 clean', () => {
    const s = resolveTurn(game('AS', [c('P'), c('K'), c('S')]), { p1: 'strike', p2: 'block' })
    expect(s.players.p2.statuses).toHaveLength(0)
  })
  it('later Strikes burst for 50% of the chain total, even when Blocked', () => {
    let s = game('AS', [c('P', 10), c('K', 7)])
    s.players.p2.statuses = [{ kind: 'deathMark', turns: 9999 }]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 17 - 8) // floor(17 / 2)
    s.players.p1.hand = [c('P', 10), c('K', 10)]
    s = resolveTurn(s, { p1: 'strike', p2: 'block' }) // both hits blocked, burst still 10
    expect(s.players.p2.hp).toBe(75 - 10)
    expect(s.players.p2.statuses.some((x) => x.kind === 'deathMark')).toBe(true)
  })
  it('a second combo does not stack the mark', () => {
    const s = game('AS', [c('P'), c('K'), c('S')])
    s.players.p2.statuses = [{ kind: 'deathMark', turns: 9999 }]
    const out = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(out.players.p2.statuses.filter((x) => x.kind === 'deathMark')).toHaveLength(1)
    expect(out.players.p2.hp).toBe(100 - 6 - 3)
  })
  it('True Damage (from cards) still lets Block stop hits', () => {
    const s = game('AS', [c('P', 10)])
    s.players.p1.statuses = [{ kind: 'trueDmg', turns: 2 }]
    expect(resolveTurn(s, { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(100)
  })
})

describe('Mage S + S + S', () => {
  it('all clean → opponent cannot Block next turn only', () => {
    let s = resolveTurn(game('MG', [c('S'), c('S'), c('S')]), { p1: 'strike', p2: 'charge' })
    expect(legalActions(s, 'p2')).not.toContain('block')
    s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(legalActions(s, 'p2')).toContain('block')
  })
})

describe('Bruiser S > P > P (Guard Crush)', () => {
  it('gives Guard Crush; if the opponent Blocks the next Strike they lose their 2 oldest Field cards, then it is used up', () => {
    let s = resolveTurn(game('BR', [c('S'), c('P'), c('P')]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.statuses).toContainEqual({ kind: 'guardBreak', turns: 3 })
    const [a, b, keep] = [c('P'), c('P'), c('P')]
    s.players.p1.hand = [c('P', 11), c('P', 11), c('P', 11)]
    s.players.p2.hand = [a, b, keep]
    const hp = s.players.p2.hp
    s = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(hp - s.players.p2.hp).toBe(5 + 5 + 11) // 2 blocked hits deal half (rounded down), 3rd lands
    expect(s.players.p2.hand.map((x) => x.uid)).toEqual([keep.uid])
    expect(s.players.p1.statuses.some((x) => x.kind === 'guardBreak')).toBe(false)
    // used up: next blocked Strike discards nothing
    s.players.p1.hand = [c('P', 11)]
    s.players.p2.hand = [c('P'), c('P')]
    expect(resolveTurn(s, { p1: 'strike', p2: 'block' }).players.p2.hand).toHaveLength(2)
  })
  it('a Strike the opponent does not Block uses it up without discarding', () => {
    const s = resolveTurn(game('BR', [c('S'), c('P'), c('P')]), { p1: 'strike', p2: 'charge' })
    s.players.p1.hand = [c('P')]
    s.players.p2.hand = [c('P'), c('P')]
    const t = resolveTurn(s, { p1: 'strike', p2: 'strike' })
    expect(t.players.p1.statuses.some((x) => x.kind === 'guardBreak')).toBe(false)
  })
  it('lasts 3 turns if you do not Strike', () => {
    let s = resolveTurn(game('BR', [c('S'), c('P'), c('P')]), { p1: 'strike', p2: 'charge' })
    for (let t = 0; t < 3; t++) s = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(s.players.p1.statuses.some((x) => x.kind === 'guardBreak')).toBe(false)
  })
})

describe('Momentum stacks (Bruiser Juggernaut Style)', () => {
  it('S + K + K is no longer a combo (Q 2026-10-16)', () => {
    const s = resolveTurn(game('BR', [c('S', 10), c('K', 10), c('K', 10)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.comboData?.conqueror).toBeUndefined()
  })
  it('at 6 stacks: Lifesteal heals 10% of each hit (rounded down)', () => {
    const s = game('BR', [c('P', 14), c('P', 14)], [], 50)
    s.players.p1.comboData = { conqueror: 6 }
    // each hit 14 + 6 = 20 → heal 2 each
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(54)
  })
  it('at 6 stacks: a charge break makes enemy hits deal 30% more (rounded down)', () => {
    const s = game('BR', [], [c('P', 10), c('P', 10)])
    s.players.p1.comboData = { conqueror: 6 }
    expect(100 - resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(26)
    const t = game('BR', [], [c('P', 10)])
    t.players.p1.comboData = { conqueror: 5 }
    expect(100 - resolveTurn(t, { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(10)
  })
})

describe('per 10 missing HP (Tank Meditation)', () => {
  const secondSkin: EffectSpec = [{ hook: 'modify', if: [{ c: 'selfAction', a: 'strike' }], do: [
    // "per missing HP" reads HP at that moment, so the scaled parts go before the heals
    { a: 'status', who: 'self', kind: 'shield', turns: 0, n: 2, per: 'missingHp10' }, { a: 'heal', who: 'self', n: 2, per: 'missingHp10' },
    { a: 'status', who: 'self', kind: 'shield', turns: 0, n: 1 }, { a: 'heal', who: 'self', n: 1 },
  ] }]
  it('heals and shields 1 + 20% of missing HP before the hits land', () => {
    // 100 / 200 HP → missing 100 → heal 21 (to 121), Shield 21 soaks 21 of the 30 incoming
    const s = resolveTurn(game('XX', [c('P', 0, secondSkin)], [c('P', 30)]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(112)
  })
  it('Shield with turns 0 is gone at the end of the turn', () => {
    const s = resolveTurn(game('XX', [c('P', 0, secondSkin)], [c('P', 30)]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.statuses.filter((x) => x.kind === 'shield')).toHaveLength(0)
  })
})

describe('% of Max HP / missing HP heals', () => {
  it('heal 2 + 3% of Max HP (rounded down)', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'heal', who: 'self', n: 2 }, { a: 'heal', who: 'self', n: 3, per: 'maxHpPct' }] }]
    // 100 / 200 → +2, then 3% of 200 = 6
    expect(resolveTurn(game('XX', [c('P', 0, spec)]), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(108)
  })
  it('heal 10% of missing HP', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', do: [{ a: 'heal', who: 'self', n: 10, per: 'missingHpPct' }] }]
    expect(resolveTurn(game('XX', [c('P', 0, spec)], [], 55), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(69) // missing 145 → 14
  })
})

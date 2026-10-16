// Signature combos: Tank S>S>S, Assassin P>K>S, Mage S+S+S.
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

describe('Tank S > S > S', () => {
  it('heals 10% of current HP when the opponent blocks one of them', () => {
    expect(resolveTurn(game('TK', [c('S'), c('S'), c('S')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(110)
  })
  it('no heal when nothing is blocked or there are fewer than 3 S cards', () => {
    expect(resolveTurn(game('TK', [c('S'), c('S'), c('S')]), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(100)
    expect(resolveTurn(game('TK', [c('S'), c('P'), c('S')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(100)
  })
  it('the 3 S cards do not need to be in a row (Q 2026-10-16)', () => {
    expect(resolveTurn(game('TK', [c('S'), c('P'), c('S'), c('S')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(110)
  })
})

describe('Assassin P > K > S → Death Mark', () => {
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

describe('Bruiser S > K > K (Conqueror)', () => {
  it('+1 stack per combo, applied to this chain too; +1 dmg per stack on every card', () => {
    const s = resolveTurn(game('BR', [c('S', 10), c('K', 10), c('K', 10)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.comboData?.conqueror).toBe(1)
    expect(100 - s.players.p2.hp).toBe(33)
    s.players.p1.hand = [c('P', 10)]
    const hp = s.players.p2.hp
    expect(hp - resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(11)
  })
  it('caps at 6 stacks', () => {
    const s = game('BR', [c('S'), c('K'), c('K')])
    s.players.p1.comboData = { conqueror: 6 }
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.comboData?.conqueror).toBe(6)
  })
  it('at 6 stacks: Omnivamp heals 10% of each hit (rounded down)', () => {
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

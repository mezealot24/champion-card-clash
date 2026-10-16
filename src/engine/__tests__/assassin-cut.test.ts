// Assassin Cut cards (Q 2026-10-16) and Sonic Bliz Overdrive.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'
import type { EffectSpec } from '../effects/spec'

let uid = 0
const card = (dmg: number, type: 'P' | 'K' | 'S' = 'P', effectSpec: EffectSpec | null = null, id = 'XX-000'): CardInst => ({ uid: `c${uid++}`, def: { id, type, dmg, effectText: '', effectSpec } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(mine: CardInst[], theirs: CardInst[], style?: string): GameState {
  const s = createGame({ championId: 'AS', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = mine
  s.players.p2.hand = theirs
  return s
}
const named = (n: number) => Array.from({ length: n }, (_, i) => card(0, 'P', null, `FOE-${i + 1}`))
const ids = (cs: CardInst[]) => cs.map((c) => c.def.id)
const cutRule = (which: 'oldest' | 'newest' | 'facing', n: number, extra: EffectSpec[number]['if'] = []): EffectSpec => [
  { hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }, ...extra], do: [{ a: 'cut', which, n }] },
]

describe('Cut', () => {
  it('oldest: the opponent loses slot 1 to the bottom of their deck, no draw', () => {
    const s = resolveTurn(game([card(5, 'S', cutRule('oldest', 1))], named(3)), { p1: 'strike', p2: 'block' })
    expect(ids(s.players.p2.hand)).toEqual(['FOE-2', 'FOE-3'])
    expect(s.players.p2.deck.at(-1)!.def.id).toBe('FOE-1')
    expect(s.players.p2.discarded?.map((d) => d.reason)).toEqual(['Cut'])
  })

  it('newest and facing', () => {
    let s = resolveTurn(game([card(5, 'S', cutRule('newest', 1))], named(3)), { p1: 'strike', p2: 'block' })
    expect(ids(s.players.p2.hand)).toEqual(['FOE-1', 'FOE-2'])
    s = resolveTurn(game([card(1), card(5, 'S', cutRule('facing', 1))], named(3)), { p1: 'strike', p2: 'block' })
    expect(ids(s.players.p2.hand)).toEqual(['FOE-1', 'FOE-3'])
  })

  it('a side loses at most 2 cards to Cut per turn', () => {
    const s = resolveTurn(game([card(1, 'P', cutRule('oldest', 2)), card(1, 'P', cutRule('oldest', 2))], named(5)), { p1: 'strike', p2: 'block' })
    expect(ids(s.players.p2.hand)).toEqual(['FOE-3', 'FOE-4', 'FOE-5'])
  })

  it('stacks with a charge break: Cut first, then the charge break takes the next oldest and draws 1', () => {
    const s = resolveTurn(game([card(5, 'S', cutRule('oldest', 1, [{ c: 'enemyAction', a: 'charge' }]))], named(3)), { p1: 'strike', p2: 'charge' })
    expect(ids(s.players.p2.hand).slice(1)).toEqual(['FOE-3']) // replacement took slot 1
    expect(s.players.p2.hand).toHaveLength(2)
  })

  it('unpaid S card: no Cut', () => {
    const g = game([card(5, 'S', cutRule('oldest', 1))], named(3))
    g.players.p1.res = 0
    expect(resolveTurn(g, { p1: 'strike', p2: 'block' }).players.p2.hand).toHaveLength(3)
  })
})

describe('Sonic Bliz Overdrive', () => {
  const five = () => Array.from({ length: 5 }, () => card(1, 'K'))
  it('full Field, no S: spends all Energy, +2 dmg per Energy on every card', () => {
    const g = game(five(), [], 'AS:1')
    g.players.p1.res = 3
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 5 * (1 + 6))
    expect(s.players.p1.res).toBe(1) // 0 after the spend, +1 at end of turn
  })

  it('works while Silenced (it is a Style)', () => {
    const g = game(five(), [], 'AS:1')
    g.players.p1.res = 2
    g.players.p1.statuses.push({ kind: 'silence', turns: 1 })
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 5 * 5)
  })

  it('not with an S card in the chain, not with fewer than 5 cards, not for Coup de grâce', () => {
    const withS = [...five().slice(0, 4), card(1, 'S')]
    let g = game(withS, [], 'AS:1')
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(95)
    g = game(five().slice(0, 4), [], 'AS:1')
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(96)
    g = game(five(), [], 'AS:2')
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 4 - 3)
  })
})

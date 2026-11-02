// Assassin Cut cards (Q 2026-10-16) and Sonic Bliz Overdrive.
import { describe, expect, it } from 'vitest'
import { createGame, overdriveAdd, resolveTurn } from '../index'
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
    expect(ids(s.players.p2.hand)[0]).toBe('FOE-3') // FOE-3 moved up to slot 1, the replacement goes on the end
    expect(s.players.p2.hand).toHaveLength(2)
  })

  it('unpaid S card: no Cut', () => {
    const g = game([card(5, 'S', cutRule('oldest', 1))], named(3))
    g.players.p1.res = 0
    expect(resolveTurn(g, { p1: 'strike', p2: 'block' }).players.p2.hand).toHaveLength(3)
  })
})

// Overdrive v2 (Sonic Bliz Flurry rework, Q 2026-11-02): Energy left after Skills → that many P/K cards get Flurry,
// +2 dmg on each of their hits. A 1-dmg card with Flurry hits 1 + 0, so 3 + 2 = 5 with the per-hit dmg.
describe('Sonic Bliz Overdrive', () => {
  const five = () => Array.from({ length: 5 }, () => card(1, 'K'))
  it('3 Energy: the first 3 cards hit twice, +2 dmg per hit; all Energy spent', () => {
    const g = game(five(), [], 'AS:1')
    g.players.p1.res = 3
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 3 * 5 - 2)
    expect(s.players.p1.res).toBe(1) // 0 after the spend, +1 at end of turn
    expect(s.events!.filter((e) => e.k === 'hit')).toHaveLength(8)
  })

  it('works while Silenced (it is a Style)', () => {
    const g = game(five(), [], 'AS:1')
    g.players.p1.res = 2
    g.players.p1.statuses.push({ kind: 'silence', turns: 1 })
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 2 * 5 - 3)
  })

  it('Skills are allowed: their cost comes first, the rest makes Flurry; Skills never get it', () => {
    const g = game([...five().slice(0, 4), card(1, 'S')], [], 'AS:1') // 3 Energy, the S pays 1
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 2 * 5 - 2 - 1)
  })

  it('not with fewer than 3 cards, not for Fatal Rhythm', () => {
    let g = game(five().slice(0, 2), [], 'AS:1')
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(98)
    g = game(five(), [], 'AS:2')
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 4 - 3)
  })

  it('overdriveAdd previews the extra dmg for the HUD chip and the AI', () => {
    const g = game(five(), [], 'AS:1')
    g.players.p1.res = 3
    expect(overdriveAdd(g, 'p1')).toBe(12) // 3 cards × 2 hits × 2
    g.players.p1.res = 0
    expect(overdriveAdd(g, 'p1')).toBe(0)
    expect(overdriveAdd(game([...five().slice(0, 4), card(1, 'S')], [], 'AS:1'), 'p1')).toBe(8)
    expect(overdriveAdd(game(five(), [], 'AS:2'), 'p1')).toBe(0)
  })
})

describe('Flurry', () => {
  const flurry: EffectSpec = [{ hook: 'modify', do: [{ a: 'flurry', target: 'this' }] }]
  const noOd = (g: GameState) => ((g.players.p1.res = 0), g)

  it('a Flurry card hits twice, its dmg split between the hits (first one gets the odd point)', () => {
    const s = resolveTurn(noOd(game([card(11, 'P', flurry)], [])), { p1: 'strike', p2: 'charge' })
    expect(s.events!.filter((e) => e.k === 'hit').map((e) => (e.k === 'hit' ? e.dealt : 0))).toEqual([6, 5])
    expect(s.players.p2.hp).toBe(89)
  })

  it('Block counts hits: a Flurry card in slot 1 uses up both, the next card gets through', () => {
    const s = resolveTurn(noOd(game([card(10, 'P', flurry), card(10, 'K')], [])), { p1: 'strike', p2: 'block' })
    expect(s.players.p2.hp).toBe(90)
  })

  it('Parry stops one hit, the second still lands', () => {
    const g = noOd(game([card(10, 'P', flurry)], []))
    g.players.p2.statuses.push({ kind: 'parry', turns: 2, n: 1 })
    expect(resolveTurn(g, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(95)
  })

  it('card effects fire once, however many hits', () => {
    const draws: EffectSpec = [...flurry, { hook: 'onHit', do: [{ a: 'draw', who: 'self', n: 1 }] }]
    const s = resolveTurn(noOd(game([card(4, 'P', draws)], [])), { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hand).toHaveLength(1)
  })
})

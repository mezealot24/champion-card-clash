// Every Assassin card's effect_json (migration 20261015000002) does what its card text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { describeSpec } from '../effects/describe'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261015000002_assassin_effect_json.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('(AS-\d{3})', '(\[.*\])'\)/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))

let uid = 0
const as = (id: string, type: CardType = 'K', dmg = 5): CardInst => ({ uid: `a${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

// p1 = Assassin at 50/110 HP, p2 at 100; decks are plain 1-dmg cards
function game(p1: CardInst[], p2: CardInst[], hp = 50): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame({ championId: 'AS', hpStart: hp, hpMax: 110, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 7 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  s.players.p1.res = 0 // no Energy Surge here: these tests are about the cards
  return s
}
const hand = (s: GameState) => s.players.p1.hand.length

it('has JSON for the 13 AS cards without one', () => expect(Object.keys(specs)).toHaveLength(13))

describe('Assassin cards', () => {
  it('AS-002 draws 1 only when blocked', () => {
    expect(hand(resolveTurn(game([as('AS-002')], []), { p1: 'strike', p2: 'block' }))).toBe(1)
    expect(hand(resolveTurn(game([as('AS-002')], []), { p1: 'strike', p2: 'charge' }))).toBe(0)
  })

  it('AS-003/004/005 draw by the opponent action', () => {
    const t = (id: string, a: 'strike' | 'block' | 'charge') => hand(resolveTurn(game([as(id)], a === 'strike' ? [plain()] : []), { p1: 'strike', p2: a }))
    expect([t('AS-003', 'charge'), t('AS-003', 'block')]).toEqual([1, 0])
    expect([t('AS-004', 'strike'), t('AS-004', 'charge')]).toEqual([2, 0])
    expect([t('AS-005', 'block'), t('AS-005', 'strike')]).toEqual([1, 0])
  })

  it('AS-006 always draws 2; AS-007 needs 3+ opponent cards; AS-008 needs HP ≤ 28', () => {
    expect(hand(resolveTurn(game([as('AS-006')], []), { p1: 'strike', p2: 'block' }))).toBe(2)
    expect(hand(resolveTurn(game([as('AS-007')], [plain(), plain(), plain()]), { p1: 'strike', p2: 'block' }))).toBe(1)
    expect(hand(resolveTurn(game([as('AS-007')], [plain(), plain()]), { p1: 'strike', p2: 'block' }))).toBe(0)
    expect(hand(resolveTurn(game([as('AS-008')], [], 28), { p1: 'strike', p2: 'block' }))).toBe(1)
    expect(hand(resolveTurn(game([as('AS-008')], [], 29), { p1: 'strike', p2: 'block' }))).toBe(0)
  })

  it("AS-009 takes 10 off the opponent's slot 1 when both Strike", () => {
    const s = resolveTurn(game([as('AS-009')], [plain(15), plain(4)]), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(50 - 5 - 4)
    // held while we Block: nothing
    expect(resolveTurn(game([as('AS-009')], [plain(15)]), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(50)
    expect(resolveTurn(game([as('AS-009')], [plain(15), plain(4), plain(4)]), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(46)
  })

  it('AS-010 in slot 4 takes 20 off the facing card', () => {
    const foe = () => [plain(1), plain(1), plain(1), plain(25)]
    const mine = (x: CardInst) => [plain(0), plain(0), plain(0), x]
    expect(resolveTurn(game(mine(as('AS-010')), foe()), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(50 - 3 - 5)
    expect(resolveTurn(game([plain(0), plain(0), as('AS-010'), plain(0)], foe()), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(50 - 28)
  })

  it('AS-011 makes the opponent lose 2 even when blocked', () => {
    expect(resolveTurn(game([as('AS-011')], []), { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(98)
  })

  it('AS-012 gives following Kicks +2; AS-013 only with a facing card', () => {
    const chain = (x: CardInst) => [x, plain(1, 'K'), plain(1, 'P'), plain(1, 'K')]
    expect(resolveTurn(game(chain(as('AS-012', 'K', 8)), []), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 8 - 3 - 1 - 3)
    expect(resolveTurn(game(chain(as('AS-013', 'K', 6)), [plain()]), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 6 - 3 - 1 - 3)
    expect(resolveTurn(game(chain(as('AS-013', 'K', 6)), []), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 6 - 1 - 1 - 1)
  })

  it('AS-014 with a facing card: draw 1, lose 3 HP', () => {
    const s = resolveTurn(game([as('AS-014')], [plain()]), { p1: 'strike', p2: 'block' })
    expect([hand(s), s.players.p1.hp]).toEqual([1, 47])
    const t = resolveTurn(game([as('AS-014')], []), { p1: 'strike', p2: 'block' })
    expect([hand(t), t.players.p1.hp]).toEqual([0, 50])
  })

  it('every rule has card text', () => {
    for (const [id, spec] of Object.entries(specs)) expect(describeSpec(spec), id).toMatch(/\w/)
    expect(describeSpec(specs['AS-009'])).toContain("pponent's card in slot 1 −10 dmg")
  })
})

// Bruiser rework (migration 20261015000001): each reworked card does what its text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'
import { drawCards } from '../state'

const sql = readFileSync(new URL('../../../supabase/migrations/20261015000001_bruiser_rework.sql', import.meta.url), 'utf8')
const cards = Object.fromEntries(
  [...sql.matchAll(/\('(BR-\d{3})', '([PKS])', (\d+), '.*?', '(\[.*\])'\)/g)].map((m) => [m[1], { type: m[2] as CardType, dmg: Number(m[3]), spec: JSON.parse(m[4]) as EffectSpec }]),
)

let uid = 0
const def = (id: string): CardDef => ({ id, type: cards[id].type, dmg: cards[id].dmg, effectText: '', effectSpec: cards[id].spec })
const br = (id: string): CardInst => ({ uid: `b${uid++}`, def: def(id) })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

// p1 = Bruiser 100/100, p2 = dummy 100/100
function game(p1: CardInst[], p2: CardInst[], p1Deck?: CardDef[]): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame({ championId: 'BR', hpStart: 100, hpMax: 100, deck: p1Deck ?? deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 3, rules: { resources: false } })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const hp = (s: GameState) => [s.players.p1.hp, s.players.p2.hp]

it('has the 7 reworked cards', () => expect(Object.keys(cards).sort()).toEqual(['BR-003', 'BR-008', 'BR-009', 'BR-012', 'BR-013', 'BR-014', 'BR-015']))

describe('Bruiser rework', () => {
  it('BR-003: facing card → lose 6, this card 19+30', () => {
    expect(hp(resolveTurn(game([br('BR-003')], [plain()]), { p1: 'strike', p2: 'charge' }))).toEqual([94, 51])
    expect(hp(resolveTurn(game([br('BR-003')], []), { p1: 'strike', p2: 'charge' }))).toEqual([100, 81])
    // held on the Field it does nothing
    expect(hp(resolveTurn(game([br('BR-003')], [plain()]), { p1: 'charge', p2: 'block' }))).toEqual([100, 100])
  })

  it("BR-008: opponent's Block stops 2 fewer hits this turn only", () => {
    const s = resolveTurn(game([br('BR-008'), plain(5)], []), { p1: 'strike', p2: 'block' })
    expect(hp(s)).toEqual([100, 87])
    // next turn Block is back to normal
    s.players.p1.hand = [plain(5), plain(5)]
    expect(hp(resolveTurn(s, { p1: 'strike', p2: 'block' }))[1]).toBe(87)
  })

  it('BR-009: lose 10 when the opponent Blocks', () => {
    expect(hp(resolveTurn(game([br('BR-009')], []), { p1: 'strike', p2: 'block' }))).toEqual([90, 100])
    expect(hp(resolveTurn(game([br('BR-009')], []), { p1: 'strike', p2: 'charge' }))).toEqual([100, 70])
    expect(hp(resolveTurn(game([br('BR-009')], []), { p1: 'charge', p2: 'block' }))).toEqual([100, 100])
  })

  it('BR-012: blocked → opponent loses 10', () => {
    expect(hp(resolveTurn(game([br('BR-012')], []), { p1: 'strike', p2: 'block' }))).toEqual([100, 90])
    expect(hp(resolveTurn(game([br('BR-012')], []), { p1: 'strike', p2: 'charge' }))).toEqual([100, 85])
  })

  it('BR-013: held while we Charge and opponent HP > 90 → lose 20', () => {
    expect(hp(resolveTurn(game([br('BR-013')], []), { p1: 'charge', p2: 'block' }))[0]).toBe(80)
    const low = game([br('BR-013')], [])
    low.players.p2.hp = 90
    expect(hp(resolveTurn(low, { p1: 'charge', p2: 'block' }))[0]).toBe(100)
    expect(hp(resolveTurn(game([br('BR-013')], []), { p1: 'strike', p2: 'charge' }))).toEqual([100, 55])
  })

  it('BR-014: +20 only below 30% HP', () => {
    const s = game([br('BR-014')], [])
    s.players.p1.hp = 29
    expect(hp(resolveTurn(s, { p1: 'strike', p2: 'charge' }))[1]).toBe(50)
    const t = game([br('BR-014')], [])
    t.players.p1.hp = 30
    expect(hp(resolveTurn(t, { p1: 'strike', p2: 'charge' }))[1]).toBe(70)
  })

  it('BR-015: lose 30 after attacking only if it came into play next to another card', () => {
    const alone = game([], [], [def('BR-015')])
    drawCards(alone, 'p1', 1)
    expect(hp(resolveTurn(alone, { p1: 'strike', p2: 'charge' }))).toEqual([100, 40])
    const crowd = game([plain(0)], [], [def('BR-015')])
    drawCards(crowd, 'p1', 1)
    expect(hp(resolveTurn(crowd, { p1: 'strike', p2: 'charge' }))).toEqual([70, 40])
  })
})

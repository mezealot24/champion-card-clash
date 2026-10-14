// Every Tank card's effect_json (migration 20261014000001) does what its card text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { describeSpec } from '../effects/describe'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261014000001_tank_effect_json.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('(TK-\d{3})', '(\[.*\])'\)/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))

let uid = 0
const tk = (id: string, type: CardType = 'P', dmg = 4): CardInst => ({ uid: `t${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

// p1 = Tank at 50/100 HP; decks are plain 1-dmg cards unless given
function game(p1: CardInst[], p2: CardInst[], p1Deck?: CardDef[]): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame(
    { championId: 'TK', hpStart: 50, hpMax: 100, deck: p1Deck ?? deck },
    { championId: 'XX', hpStart: 100, hpMax: 100, deck },
    { seed: 7 },
  )
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}

it('has JSON for all 16 Tank cards', () => expect(Object.keys(specs)).toHaveLength(16))

describe('Tank cards', () => {
  it('TK-001..003 heal only in their slot (even when blocked)', () => {
    const t = (cards: CardInst[]) => resolveTurn(game(cards, []), { p1: 'strike', p2: 'block' }).players.p1.hp
    expect(t([tk('TK-001')])).toBe(62)
    expect(t([plain(), tk('TK-001')])).toBe(50)
    expect(t([plain(), tk('TK-002')])).toBe(64)
    expect(t([plain(), plain(), tk('TK-003')])).toBe(70)
  })

  it('TK-004 heals 8 on a charge break (we Charge, opponent Strikes)', () => {
    expect(resolveTurn(game([tk('TK-004')], [plain(3)]), { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(50 - 3 + 8)
    expect(resolveTurn(game([tk('TK-004')], [plain(3)]), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(50)
    expect(resolveTurn(game([tk('TK-004')], []), { p1: 'charge', p2: 'block' }).players.p1.hp).toBe(50)
    // still fires when the charge break throws it away (hand > 1, oldest card is lost)
    expect(resolveTurn(game([tk('TK-004'), plain()], [plain(3)]), { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(55)
  })

  it("TK-005 held while we Charge: opponent's Kicks deal half (rounded down)", () => {
    const foe = () => [plain(10, 'K'), plain(7, 'K'), plain(6, 'P')]
    expect(resolveTurn(game([tk('TK-005')], foe()), { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(50 - 5 - 3 - 6)
    expect(resolveTurn(game([tk('TK-005')], foe()), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(50 - 23)
  })

  it('TK-011 heals 10 when we Strike and take hit dmg this turn', () => {
    expect(resolveTurn(game([tk('TK-011')], [plain(3), plain(3)]), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(50 - 6 + 10)
    expect(resolveTurn(game([tk('TK-011')], [plain(0)]), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(50)
    expect(resolveTurn(game([tk('TK-011')], []), { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(50)
  })

  it('TK-006 needs the opponent at 5 cards; TK-007 needs opponent Strike; TK-008 always', () => {
    const five = () => [plain(), plain(), plain(), plain(), plain()]
    const a = resolveTurn(game([tk('TK-006')], five()), { p1: 'strike', p2: 'block' }).players.p1
    expect([a.hp, a.hand.length]).toEqual([58, 1])
    expect(resolveTurn(game([tk('TK-006')], [plain()]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(50)
    const b = resolveTurn(game([tk('TK-007')], [plain(0)]), { p1: 'strike', p2: 'strike' }).players.p1
    expect([b.hp, b.hand.length]).toEqual([52, 1])
    expect(resolveTurn(game([tk('TK-007')], []), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(50)
    const c = resolveTurn(game([tk('TK-008')], []), { p1: 'strike', p2: 'charge' }).players.p1
    expect([c.hp, c.hand.length]).toEqual([52, 1])
  })

  it('TK-009 heals 3 per hit stopped when we Block while holding it', () => {
    const chain = (n: number) => Array.from({ length: n }, () => plain(0))
    expect(resolveTurn(game([tk('TK-009')], chain(1)), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(53)
    expect(resolveTurn(game([tk('TK-009')], chain(4)), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(56) // Block stops 2
    expect(resolveTurn(game([tk('TK-009')], []), { p1: 'block', p2: 'charge' }).players.p1.hp).toBe(50)
  })

  it('TK-010 heals both players when drawn', () => {
    const s = resolveTurn(game([], [], [tk('TK-010').def]), { p1: 'charge', p2: 'block' })
    expect([s.players.p1.hp, s.players.p2.hp]).toEqual([58, 100])
  })

  it('TK-012 draws when blocked', () => {
    expect(resolveTurn(game([tk('TK-012')], []), { p1: 'strike', p2: 'block' }).players.p1.hand).toHaveLength(1)
  })

  it('TK-013 gives +6 to Kicks after it only', () => {
    const s = resolveTurn(game([plain(1, 'K'), tk('TK-013', 'K'), plain(1, 'K'), plain(1, 'P')], []), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 1 - 4 - 7 - 1)
  })

  it('TK-014 heals 20 under 30 HP, once per game per copy', () => {
    const card = tk('TK-014')
    let s = game([card], [])
    s.players.p1.hp = 29
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hp).toBe(49)
    const again = s.players.p1.deck.find((c) => c.uid === card.uid)!
    s.players.p1.hp = 10
    s.players.p1.hand = [again]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(10)
    const high = game([tk('TK-014')], [])
    high.players.p1.hp = 30
    expect(resolveTurn(high, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(30)
  })

  it('TK-015 needs a facing card of the same type: Max HP −5, heal 10', () => {
    const a = resolveTurn(game([tk('TK-015', 'S')], [plain(0, 'S')]), { p1: 'strike', p2: 'block' }).players.p1
    expect([a.maxHp, a.hp]).toEqual([95, 60])
    expect(resolveTurn(game([tk('TK-015', 'S')], [plain(0, 'P')]), { p1: 'strike', p2: 'block' }).players.p1.hp).toBe(50)
  })

  it('TK-016 drawn this turn: our Block stops 3 hits next turn, then back to 2', () => {
    let s = resolveTurn(game([], [], [tk('TK-016').def]), { p1: 'charge', p2: 'block' })
    const chain = () => [plain(5), plain(5), plain(5), plain(5)]
    s.players.p2.hand = chain()
    s = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(45) // 3 stopped, 1 lands
    s.players.p2.hand = chain()
    s = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(35) // back to 2 stopped
  })

  it('TK-017 on Field while opponent has 3+ cards: our Block stops 1 hit next turn', () => {
    const spec: EffectSpec = JSON.parse(readFileSync(new URL('../../../supabase/migrations/20261014000002_tk017.sql', import.meta.url), 'utf8').match(/'(\[\{"hook".*\])'\)/)![1])
    const card: CardInst = { uid: 'tk17', def: { id: 'TK-017', type: 'S', dmg: 20, effectText: '', effectSpec: spec } }
    const chain = () => [plain(5), plain(5), plain(5)]
    let s = resolveTurn(game([card], chain()), { p1: 'charge', p2: 'block' })
    s.players.p2.hand = chain()
    s = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(50 - 10) // only 1 hit stopped
    const calm = resolveTurn(game([card], [plain()]), { p1: 'charge', p2: 'block' })
    calm.players.p2.hand = chain()
    expect(resolveTurn(calm, { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(50 - 5)
    expect(describeSpec(spec)).toBe('Every turn (Hold), if opponent has 3+ cards: Your Block stops −1 hit next turn')
  })

  it('describes the new pieces in English', () => {
    expect(describeSpec(specs['TK-009'])).toBe('Every turn (Hold), if you play Block and opponent plays Strike: Gain 3 HP per hit you blocked this turn')
    expect(describeSpec(specs['TK-014'])).toBe('After attack, if your HP ≤ 29: Gain 20 HP (once per game)')
    expect(describeSpec(specs['TK-016'])).toBe('Comes into play: Your Block stops +1 hit next turn')
    expect(describeSpec(specs['TK-005'])).toBe("Before attack, if you play Charge: All opponent's Kick cards lose 50% dmg")
    expect(describeSpec(specs['TK-011'])).toBe('After attack, if you play Strike and you take dmg from a hit this turn: Gain 10 HP')
  })
})

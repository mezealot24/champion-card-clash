// Mage deck v2 (migration 20261015000004): every MG card's effect_json does what its card text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn } from '../index'
import type { Action, CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261015000004_mage_deck_v2.sql', import.meta.url), 'utf8')
const rows = [...sql.matchAll(/\('(MG-\d{3})', 'MG', '[^']*', '[^']*', '[^']*', '([PKS])', (\d+), .*?, (true|false), '\{[^}]*\}',\s*'(\[.*\])'\)/g)]
const specs = Object.fromEntries(rows.map((m) => [m[1], JSON.parse(m[5]) as EffectSpec]))

let uid = 0
const mg = (id: string, type: CardType = 'S', dmg = 4): CardInst => ({ uid: `m${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

// p1 = Mage at 60/80 HP, p2 at 100; decks are plain 1-dmg cards
function game(p1: CardInst[], p2: CardInst[], hp = 60): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame({ championId: 'MG', hpStart: hp, hpMax: 80, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 7 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const turn = (s: GameState, p1: Action, p2: Action) => resolveTurn(s, { p1, p2 })
const foeHp = (s: GameState) => s.players.p2.hp

it('has 20 MG cards, 15 of them in the deck', () => {
  expect(rows).toHaveLength(20)
  expect(rows.filter((m) => m[4] === 'true')).toHaveLength(15)
})

describe('Mage cards', () => {
  it('MG-001 gives the next card +8', () => {
    expect(foeHp(turn(game([mg('MG-001'), plain(1)], []), 'strike', 'charge'))).toBe(100 - 4 - 9)
  })

  it('MG-002 scales with chain length', () => {
    const t = (n: number) => foeHp(turn(game([mg('MG-002'), ...Array.from({ length: n - 1 }, () => plain(0))], []), 'strike', 'charge'))
    expect([t(2), t(3), t(5)]).toEqual([96, 90, 84])
  })

  it('MG-003 doubles in an all-S chain', () => {
    expect(foeHp(turn(game([mg('MG-003', 'S', 14), plain(0, 'S')], []), 'strike', 'charge'))).toBe(72)
    expect(foeHp(turn(game([mg('MG-003', 'S', 14), plain(0, 'P')], []), 'strike', 'charge'))).toBe(86)
  })

  it('MG-004 / MG-005 lock Strike / Block next turn on a clean hit only', () => {
    expect(legalActions(turn(game([mg('MG-004')], [plain()]), 'strike', 'charge'), 'p2')).not.toContain('strike')
    expect(legalActions(turn(game([mg('MG-005')], []), 'strike', 'charge'), 'p2')).not.toContain('block')
    expect(legalActions(turn(game([mg('MG-005')], []), 'strike', 'block'), 'p2')).toContain('block')
  })

  it('MG-006 costs 2 HP per enemy Field card', () => {
    expect(foeHp(turn(game([mg('MG-006', 'S', 6)], [plain(), plain(), plain()]), 'strike', 'charge'))).toBe(100 - 6 - 6)
  })

  it('MG-007 held: a striking opponent cannot Charge next turn', () => {
    const s = turn(game([mg('MG-007')], [plain()]), 'block', 'strike')
    expect(legalActions(s, 'p2')).not.toContain('charge')
  })

  it('MG-008 halves the facing enemy card; MG-010 / MG-011 cut it', () => {
    expect(turn(game([mg('MG-008')], [plain(10)]), 'charge', 'strike').players.p1.hp).toBe(55)
    expect(turn(game([mg('MG-010', 'K', 8)], [plain(10)]), 'charge', 'strike').players.p1.hp).toBe(56)
    const three = () => [plain(20), plain(1), plain(1)]
    expect(turn(game([mg('MG-011', 'K', 9)], three()), 'charge', 'strike').players.p1.hp).toBe(60 - 4 - 2)
  })

  it('MG-009 held: a Blocking opponent cannot Block next turn', () => {
    expect(legalActions(turn(game([mg('MG-009', 'K', 6)], []), 'charge', 'block'), 'p2')).not.toContain('block')
  })

  it('MG-012 / 013 need 3+ enemy cards', () => {
    const foe3 = () => [plain(), plain(), plain()]
    expect(foeHp(turn(game([mg('MG-012', 'P', 6), plain(1)], foe3()), 'strike', 'charge'))).toBe(100 - 6 - 4)
    expect(foeHp(turn(game([mg('MG-013', 'P', 8)], foe3()), 'strike', 'charge'))).toBe(82)
    expect(foeHp(turn(game([mg('MG-013', 'P', 8)], []), 'strike', 'charge'))).toBe(92)
  })

  it('MG-014 / 015 draw', () => {
    const hand = (s: GameState) => s.players.p1.hand.length
    expect(hand(turn(game([mg('MG-014', 'P', 10)], [plain(), plain(), plain()]), 'strike', 'block'))).toBe(1)
    const s = turn(game([mg('MG-015', 'P', 6)], []), 'strike', 'block')
    expect([hand(s), s.players.p2.hand.length]).toEqual([2, 1])
  })

  it('MG-016 Block stops 3; MG-017 heals 3 per blocked hit', () => {
    const chain = () => [plain(5), plain(5), plain(5), plain(5)]
    expect(turn(game([mg('MG-016', 'P', 5)], chain()), 'block', 'strike').players.p1.hp).toBe(55)
    expect(turn(game([mg('MG-017', 'K', 6)], chain()), 'block', 'strike').players.p1.hp).toBe(60 - 10 + 6)
  })

  it('MG-018 draws 1 when it comes into play', () => {
    const s = game([], [])
    s.players.p1.deck = [mg('MG-018', 'S', 3), ...s.players.p1.deck]
    expect(turn(s, 'charge', 'block').players.p1.hand.length).toBe(2)
  })

  it('MG-019 makes the next Block stop 1 fewer hit', () => {
    let s = turn(game([mg('MG-019', 'S', 6)], []), 'strike', 'charge')
    s.players.p1.hand = [plain(5), plain(5)]
    s = turn(s, 'strike', 'block')
    expect(foeHp(s)).toBe(100 - 6 - 5)
  })

  it('MG-020 +8 into a Charge', () => {
    expect(foeHp(turn(game([mg('MG-020', 'S', 7)], []), 'strike', 'charge'))).toBe(85)
    expect(foeHp(turn(game([mg('MG-020', 'S', 7)], [plain()]), 'strike', 'strike'))).toBe(93)
  })
})

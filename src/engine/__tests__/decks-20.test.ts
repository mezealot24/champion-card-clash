// Q 2026-10-15 16:39Z: 20-card decks (new AS / BR / TK cards in migration 20261015000005), Silence, reshuffle.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn } from '../index'
import type { Action, CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261015000005_decks_20_hp_silence.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('((?:AS|BR|TK)-\d{3})', .*?\n\s*'(\[.*\])'\)/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))

let uid = 0
const card = (id: string, type: CardType, dmg: number): CardInst => ({ uid: `c${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })

// p1 at 60/100 HP, p2 at 100/100; decks are plain 1-dmg cards
function game(p1: CardInst[], p2: CardInst[], hp = 60): GameState {
  const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const s = createGame({ championId: 'P1', hpStart: hp, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 7 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const turn = (s: GameState, p1: Action, p2: Action) => resolveTurn(s, { p1, p2 })
const foeHp = (s: GameState) => s.players.p2.hp
const hand = (s: GameState) => s.players.p1.hand.length

it('has the 13 new cards', () => expect(Object.keys(specs).sort()).toEqual([
  'AS-015', 'AS-016', 'AS-017', 'AS-018', 'AS-019', 'BR-016', 'BR-017', 'BR-018', 'BR-019', 'BR-020', 'TK-018', 'TK-019', 'TK-020',
]))

describe('Assassin speed + Critical', () => {
  it('AS-015 draws 1 when it comes into play; AS-016 makes Charge draw 2', () => {
    const s = game([], [])
    s.players.p1.deck = [card('AS-015', 'P', 5), ...s.players.p1.deck]
    expect(hand(turn(s, 'charge', 'block'))).toBe(2)
    expect(hand(turn(game([card('AS-016', 'K', 6)], []), 'charge', 'block'))).toBe(3)
  })

  it('AS-017 x2 into a Charge; AS-019 x3 with 4+ cards', () => {
    expect(foeHp(turn(game([card('AS-017', 'S', 10)], []), 'strike', 'charge'))).toBe(80)
    expect(foeHp(turn(game([card('AS-017', 'S', 10)], []), 'strike', 'block'))).toBe(100)
    const four = (x: CardInst) => [plain(0), plain(0), plain(0), x]
    expect(foeHp(turn(game(four(card('AS-019', 'S', 8)), []), 'strike', 'charge'))).toBe(76)
    expect(foeHp(turn(game([plain(0), card('AS-019', 'S', 8)], []), 'strike', 'charge'))).toBe(92)
  })

  it('AS-018 keeps +4 per clean hit for the rest of the game', () => {
    const w = card('AS-018', 'K', 6)
    let s = turn(game([w], []), 'strike', 'charge')
    s.players.p1.hand = [s.players.p1.deck.find((c) => c.uid === w.uid)!]
    s = turn(s, 'strike', 'charge')
    expect(foeHp(s)).toBe(100 - 6 - 10)
  })
})

describe('Bruiser', () => {
  it('BR-016 heals 6 on a clean hit; BR-017 +12 under 50% HP', () => {
    expect(turn(game([card('BR-016', 'P', 12)], []), 'strike', 'charge').players.p1.hp).toBe(66)
    expect(foeHp(turn(game([card('BR-017', 'K', 14)], [], 40), 'strike', 'charge'))).toBe(74)
    expect(foeHp(turn(game([card('BR-017', 'K', 14)], [], 60), 'strike', 'charge'))).toBe(86)
  })

  it('BR-018 heals per blocked hit; BR-019 cracks Block; BR-020 grows when blocked', () => {
    expect(turn(game([card('BR-018', 'P', 10)], [plain(5), plain(5)]), 'block', 'strike').players.p1.hp).toBe(66)
    const s = turn(game([plain(1), card('BR-019', 'S', 25)], []), 'strike', 'block')
    expect([foeHp(s), s.players.p1.hp]).toEqual([75, 55])
    const h = card('BR-020', 'P', 20)
    const after = turn(game([h], []), 'strike', 'block')
    expect(after.players.p1.deck.find((c) => c.uid === h.uid)?.growNext).toBe(10)
  })
})

describe('Tank', () => {
  it('TK-018 −2 to every enemy card; TK-019 Max HP +5 on Block; TK-020 blocks Charge', () => {
    expect(turn(game([card('TK-018', 'P', 8)], [plain(5), plain(5)]), 'charge', 'strike').players.p1.hp).toBe(54)
    const f = turn(game([card('TK-019', 'K', 10)], []), 'block', 'charge').players.p1
    expect([f.maxHp, f.hp]).toEqual([105, 65])
    expect(legalActions(turn(game([card('TK-020', 'S', 12)], []), 'strike', 'block'), 'p2')).toContain('charge')
    expect(legalActions(turn(game([card('TK-020', 'S', 12)], []), 'strike', 'charge'), 'p2')).not.toContain('charge')
  })
})

describe('Silence', () => {
  it("a Silenced side's cards do nothing that turn, then work again", () => {
    let s = game([card('BR-016', 'P', 12)], [])
    s.players.p1.statuses.push({ kind: 'silence', turns: 1 })
    s = turn(s, 'strike', 'charge')
    expect(s.players.p1.hp).toBe(60)
    s.players.p1.hand = [card('BR-016', 'P', 12)]
    expect(turn(s, 'strike', 'charge').players.p1.hp).toBe(66)
  })
})

describe('Reshuffle', () => {
  it('reshuffles once a whole deck has been drawn', () => {
    const deck = Array.from({ length: 4 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
    let s = createGame({ championId: 'A', hpStart: 50, hpMax: 50, deck }, { championId: 'B', hpStart: 50, hpMax: 50, deck }, { seed: 3 })
    for (let i = 0; i < 3; i++) s = turn(s, 'charge', 'charge')
    expect(s.players.p1.drawsSinceShuffle).toBe(3)
    s = turn(s, 'charge', 'charge')
    expect(s.players.p1.drawsSinceShuffle).toBe(0)
    expect(s.log.some((l) => l.includes('สับ deck ใหม่'))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { buildDeck, createGame, isEffectMissing, pickAiAction, resolveTurn } from '../index'
import type { CardDef, CardInst, CardType, GameState, Side } from '../index'

// Bruiser deck as in Supabase on 2026-10-13
const BRUISER_ROWS = [
  ['BR-001', 'K', 16, 'เราเสีย 3 HP'],
  ['BR-002', 'P', 16, 'ถ้าศัตรูมือว่าง: ศัตรูจั่ว 1'],
  ['BR-003', 'K', 14, ''],
  ['BR-004', 'K', 14, 'ถ้ามีใบประจันหน้า: ใบนี้ −4'],
  ['BR-005', 'K', 10, 'ถ้าสายเป็น Kick ล้วน: ทั้งคู่จั่ว 1'],
  ['BR-006', 'P', 10, 'ถ้าศัตรูมี ≥4 ใบ: ใบที่ตามหลัง +2'],
  ['BR-007', 'K', 8, 'ทั้งคู่จั่ว 1'],
  ['BR-008', 'P', 8, 'ถ้าศัตรู Strike สาย ≥3 ใบ: จั่ว 1'],
  ['BR-009', 'P', 8, 'ถ้าสายมีใบเดียว: จั่ว 1'],
  ['BR-010', 'K', 8, 'ถ้าศัตรูมี ≥2 ใบ: ฮีล 10'],
  ['BR-011', 'P', 7, 'ถ้าสายเป็น Punch ล้วน: ใบที่ 3 +8'],
  ['BR-012', 'K', 7, ''],
  ['BR-013', 'P', 4, ''],
  ['BR-014', 'P', 4, ''],
  ['BR-015', 'P', 3, ''],
].map(([id, type, dmg, effect]) => ({ id, type, dmg, effect, copies: 1 }) as {
  id: string
  type: CardType
  dmg: number
  effect: string
  copies: number
})

const deck = buildDeck(BRUISER_ROWS)
const def = (id: string): CardDef => deck.find((d) => d.id === id)!
let uid = 0
const card = (id: string): CardInst => ({ uid: `t${uid++}`, def: def(id) })
const vanilla = (dmg: number, type: CardType = 'P'): CardInst => ({
  uid: `t${uid++}`,
  def: { id: 'XX-000', type, dmg, effectText: '' },
})

/** Fresh game with chosen hands, HP 100/150 each. */
function setup(p1Hand: CardInst[], p2Hand: CardInst[]): GameState {
  const setupChamp = { championId: 'BR', hpStart: 100, hpMax: 150, deck }
  const s = createGame(setupChamp, setupChamp, { seed: 1 })
  s.players.p1.hand = p1Hand
  s.players.p2.hand = p2Hand
  return s
}
const hp = (s: GameState, side: Side) => s.players[side].hp

describe('clash rules', () => {
  it('Strike vs Block: first 2 hits stopped, rest land; striker empties hand, blocker keeps it', () => {
    const s = setup([vanilla(5), vanilla(5), vanilla(5), vanilla(5)], [vanilla(1)])
    const deckBefore = s.players.p1.deck.length
    const n = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(hp(n, 'p2')).toBe(90)
    expect(n.players.p1.hand).toHaveLength(0)
    expect(n.players.p2.hand).toHaveLength(1)
    expect(n.players.p1.deck).toHaveLength(deckBefore + 4)
  })

  it('Strike vs Charge: full damage, charger loses oldest card and does not draw', () => {
    const oldest = vanilla(1)
    const s = setup([vanilla(5), vanilla(5)], [oldest, vanilla(1)])
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(hp(n, 'p2')).toBe(90)
    expect(n.players.p2.hand.map((c) => c.uid)).not.toContain(oldest.uid)
    expect(n.players.p2.hand).toHaveLength(1)
  })

  it('Strike vs Strike: both hit fully, both hands empty', () => {
    const s = setup([vanilla(5), vanilla(5)], [vanilla(7)])
    const n = resolveTurn(s, { p1: 'strike', p2: 'strike' })
    expect(hp(n, 'p1')).toBe(93)
    expect(hp(n, 'p2')).toBe(90)
    expect(n.players.p1.hand).toHaveLength(0)
    expect(n.players.p2.hand).toHaveLength(0)
  })

  it('Charge vs Block draws 1; Charge vs Charge both draw 1', () => {
    const s = setup([], [])
    expect(resolveTurn(s, { p1: 'charge', p2: 'block' }).players.p1.hand).toHaveLength(1)
    const both = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(both.players.p1.hand).toHaveLength(1)
    expect(both.players.p2.hand).toHaveLength(1)
  })

  it('Block vs Block 3 times in a row: everyone discards the whole hand', () => {
    let s = setup([vanilla(1)], [vanilla(1), vanilla(1)])
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(s.players.p1.hand).toHaveLength(1)
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(s.players.p1.hand).toHaveLength(0)
    expect(s.players.p2.hand).toHaveLength(0)
  })

  it('cannot Strike with an empty hand; input state is never mutated', () => {
    const s = setup([], [vanilla(1)])
    expect(() => resolveTurn(s, { p1: 'strike', p2: 'block' })).toThrow()
    const before = JSON.stringify(s)
    resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(JSON.stringify(s)).toBe(before)
  })

  it('declares the winner at 0 HP', () => {
    const s = setup([vanilla(200)], [])
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).winner).toBe('p1')
  })
})

describe('Bruiser effects', () => {
  it('BR-001 costs 3 HP even when blocked (blocked cards still fire effects)', () => {
    const n = resolveTurn(setup([card('BR-001')], []), { p1: 'strike', p2: 'block' })
    expect(hp(n, 'p1')).toBe(97)
    expect(hp(n, 'p2')).toBe(100)
  })

  it('BR-004 is −4 only when the enemy hand has a card in the same slot', () => {
    const withFacing = resolveTurn(setup([card('BR-004')], [vanilla(1)]), { p1: 'strike', p2: 'charge' })
    expect(hp(withFacing, 'p2')).toBe(90)
    const noFacing = resolveTurn(setup([vanilla(1), card('BR-004')], [vanilla(1)]), { p1: 'strike', p2: 'charge' })
    expect(hp(noFacing, 'p2')).toBe(100 - 1 - 14)
  })

  it('BR-006 gives the next card +2 when the enemy holds ≥4 cards', () => {
    const foe = [vanilla(1), vanilla(1), vanilla(1), vanilla(1)]
    const n = resolveTurn(setup([card('BR-006'), vanilla(5), vanilla(5)], foe), { p1: 'strike', p2: 'charge' })
    expect(hp(n, 'p2')).toBe(100 - 10 - 7 - 5)
  })

  it('BR-011 adds +8 to slot 3 when the chain is all Punch', () => {
    const n = resolveTurn(setup([card('BR-011'), vanilla(1, 'P'), vanilla(1, 'P')], []), { p1: 'strike', p2: 'charge' })
    expect(hp(n, 'p2')).toBe(100 - 7 - 1 - 9)
    const mixed = resolveTurn(setup([card('BR-011'), vanilla(1, 'K'), vanilla(1, 'P')], []), { p1: 'strike', p2: 'charge' })
    expect(hp(mixed, 'p2')).toBe(100 - 7 - 1 - 1)
  })

  it('BR-007 both draw 1, and the draw enters the hand after the chain', () => {
    const n = resolveTurn(setup([card('BR-007'), vanilla(1)], [vanilla(1)]), { p1: 'strike', p2: 'block' })
    expect(n.players.p1.hand).toHaveLength(1)
    expect(n.players.p2.hand).toHaveLength(2)
  })

  it('BR-005 draws for both only on an all-Kick chain', () => {
    const allK = resolveTurn(setup([card('BR-005'), vanilla(1, 'K')], []), { p1: 'strike', p2: 'charge' })
    expect(allK.players.p1.hand).toHaveLength(1)
    const mixed = resolveTurn(setup([card('BR-005'), vanilla(1, 'P')], []), { p1: 'strike', p2: 'charge' })
    expect(mixed.players.p1.hand).toHaveLength(0)
  })

  it('BR-008 draws when the enemy Strikes with ≥3 cards', () => {
    const n = resolveTurn(setup([card('BR-008')], [vanilla(1), vanilla(1), vanilla(1)]), { p1: 'strike', p2: 'strike' })
    expect(n.players.p1.hand).toHaveLength(1)
  })

  it('BR-009 draws on a one-card chain; BR-010 heals 10 vs ≥2 enemy cards; BR-002 feeds an empty enemy', () => {
    expect(resolveTurn(setup([card('BR-009')], []), { p1: 'strike', p2: 'charge' }).players.p1.hand).toHaveLength(1)
    const s = setup([card('BR-010')], [vanilla(1), vanilla(1)])
    s.players.p1.hp = 50
    expect(hp(resolveTurn(s, { p1: 'strike', p2: 'block' }), 'p1')).toBe(60)
    expect(resolveTurn(setup([card('BR-002')], []), { p1: 'strike', p2: 'block' }).players.p2.hand).toHaveLength(1)
  })

  it('every Bruiser card with effect text has code', () => {
    expect(BRUISER_ROWS.filter((r) => isEffectMissing(r.id, r.effect))).toEqual([])
  })
})

describe('full match', () => {
  it('AI vs AI Bruiser mirror finishes without errors', () => {
    let s = createGame(
      { championId: 'BR', hpStart: 110, hpMax: 110, deck },
      { championId: 'BR', hpStart: 110, hpMax: 110, deck },
      { seed: 42 },
    )
    let rng = 7
    const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 300 && !s.winner; i++) {
      s = resolveTurn(s, { p1: pickAiAction(s, 'p1', rand), p2: pickAiAction(s, 'p2', rand) })
    }
    expect(s.winner).not.toBeNull()
    for (const side of ['p1', 'p2'] as const) {
      const p = s.players[side]
      expect(p.hand.length + p.deck.length).toBe(15) // no card lost or duplicated
    }
  })
})

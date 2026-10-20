import { describe, expect, it } from 'vitest'
import { buildDeck, createGame } from '../../engine'
import { deckPool, deckProblems, deckRows, deckRulesFromConfig, defaultList, pickTarget, type DeckRow } from '../deck/deck'

const card = (id: string, extra: Partial<DeckRow> = {}): DeckRow => ({ id, champion_id: 'MG', type: 'P', dmg: 5, effect: '', copies: 1, in_deck: true, ...extra })
// Mage-like: 5 base cards in deck, 2 spare in the pool, Style swaps 1 card per Style
const rows: DeckRow[] = [
  ...['A', 'B', 'C', 'D', 'E'].map((id) => card(id)),
  card('F', { in_deck: false }),
  card('G', { in_deck: false }),
  card('X1', { style_only: '!MG:1' }),
  card('X2', { style_only: '!MG:2' }),
  card('P1', { style_only: 'MG:1' }),
  card('C2', { style_only: 'MG:2' }),
  card('OLD', { style_only: 'MG:1', in_deck: false }),
]
const rules = { size: 7, maxCopies: 2 }

describe('deck builder', () => {
  it('reads deck_size and deck_max_copies from config', () => {
    expect(deckRulesFromConfig([{ key: 'deck_size', value: 25 }, { key: 'deck_max_copies', value: 3 }])).toEqual({ size: 25, maxCopies: 3 })
    expect(deckRulesFromConfig([{ key: 'deck_max_copies', value: 'x' }])).toEqual({ size: 25, maxCopies: 2 })
  })

  it('pool = own non-Style cards, including ones not in the default deck', () => {
    expect(deckPool(rows).map((r) => r.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('Style cards fill their own slots, the player picks the rest', () => {
    expect(pickTarget(rows, 'MG:1', rules)).toBe(5) // X2 + P1
    expect(pickTarget(rows, undefined, rules)).toBe(5) // X1 + X2
  })

  it('default deck is legal; wrong counts and copies are not', () => {
    expect(deckProblems(defaultList(rows), rows, 'MG:1', rules)).toEqual([])
    expect(deckProblems({ A: 3, B: 2 }, rows, 'MG:1', rules)).toEqual(['More than 2 copies: A'])
    expect(deckProblems({ A: 2 }, rows, 'MG:1', rules)).toEqual(['Add 3 more cards'])
    expect(deckProblems({ A: 2, B: 2, Z: 1 }, rows, 'MG:1', rules)[0]).toMatch(/No longer in the pool: Z/)
  })

  it('a legal list builds a full deck with the Style cards', () => {
    const { rows: picked, custom } = deckRows(rows, { F: 2, G: 2, A: 1 }, 'MG:1', rules)
    expect(custom).toBe(true)
    const g = createGame(
      { championId: 'MG', hpStart: 130, hpMax: 130, deck: buildDeck(picked), style: 'MG:1' },
      { championId: 'MG', hpStart: 130, hpMax: 130, deck: buildDeck(rows), style: 'MG:1' },
      { seed: 1 },
    )
    const ids = [...g.players.p1.deck, ...g.players.p1.hand].map((c) => c.def.id).sort()
    expect(ids).toEqual(['A', 'F', 'F', 'G', 'G', 'P1', 'X2'])
  })

  it('an illegal list falls back to the default deck', () => {
    expect(deckRows(rows, { A: 1 }, 'MG:1', rules)).toEqual({ rows, custom: false })
    expect(deckRows(rows, null, 'MG:1', rules).custom).toBe(false)
  })
})

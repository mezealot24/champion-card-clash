// AI v2 scoring: combo potential is read from the COMBOS table.
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, pickAiAction, pickSmartAction } from '../index'
import { aiActions, comboPotential } from '../ai'
import type { CardDef, CardInst, CardType, GameState } from '../index'

let uid = 0
const c = (type: CardType, dmg = 2): CardInst => ({ uid: `c${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deckOf = (type: CardType): CardDef[] => Array.from({ length: 10 }, (_, i) => ({ id: `XX-${i}`, type, dmg: 1, effectText: '' }))

function game(champ: string, mine: CardInst[], deckType: CardType = 'P'): GameState {
  const s = createGame({ championId: champ, hpStart: 100, hpMax: 100, deck: deckOf(deckType) }, { championId: 'XX', hpStart: 100, hpMax: 100, deck: deckOf('P') }, { seed: 1, rules: { resources: false } })
  s.players.p1.hand = mine
  return s
}

describe('comboPotential', () => {
  it('is 1 when the Field already holds the combo types, in any order', () => {
    expect(comboPotential(game('AS', [c('S'), c('P'), c('K')]), 'p1')).toBe(1)
  })
  it('is 0 for a Champion with no combo, or when the missing cards no longer fit on the Field', () => {
    expect(comboPotential(game('XX', [c('S')]), 'p1')).toBe(0)
    expect(comboPotential(game('MG', [c('P'), c('P'), c('P'), c('P'), c('S')]), 'p1')).toBe(0)
  })
  it('a missing type that is not in the deck counts nothing; one that is counts something', () => {
    expect(comboPotential(game('MG', [c('S'), c('S')], 'P'), 'p1')).toBe(0)
    const near = comboPotential(game('MG', [c('S'), c('S')], 'S'), 'p1')
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThanOrEqual(1)
  })
})

describe('pickSmartAction', () => {
  it('always returns a legal action', () => {
    const s = game('MG', [c('S'), c('S')], 'S')
    for (let i = 0; i < 20; i++) expect(legalActions(s, 'p1')).toContain(pickSmartAction(s, 'p1', () => i / 20))
  })
})

describe('AI with a full Field (Q 2026-10-17)', () => {
  it('only Strikes or Blocks, never Charges', () => {
    const s = game('MG', [c('S'), c('S'), c('P'), c('K'), c('P')])
    expect(aiActions(s, 'p1')).toEqual(['strike', 'block'])
    for (let i = 0; i < 20; i++) expect(pickSmartAction(s, 'p1', () => i / 20)).not.toBe('charge')
    for (let i = 0; i < 20; i++) expect(pickAiAction(s, 'p1', () => i / 20)).not.toBe('charge')
  })
  it('still Charges when Charge is the only choice left', () => {
    const s = game('MG', [c('P'), c('P'), c('P'), c('P'), c('P')])
    s.players.p1.statuses = [{ kind: 'noStrike', turns: 1 }, { kind: 'noBlock', turns: 1 }]
    expect(aiActions(s, 'p1')).toEqual(['charge'])
  })
})

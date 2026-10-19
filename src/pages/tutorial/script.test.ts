// The scripted tutorial turns must be playable: if the player does what the coach asks, both sides' actions are legal.
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn, type CardDef, type CardType } from '../../engine'
import { outcomeLine, TUTORIAL, tutorialFoe } from './script'

const deck = (champ: string): CardDef[] =>
  (['P', 'K', 'S', 'P', 'K', 'P', 'K', 'S', 'P', 'K'] as CardType[]).map((type, i) => ({ id: `${champ}-${i}`, type, dmg: 5, effectText: '' }))
const setup = (id: string) => ({ championId: id, hpStart: 200, hpMax: 200, deck: deck(id) })

describe('tutorial script', () => {
  for (const me of ['TK', 'BR', 'AS', 'MG']) {
    it(`${me}: every scripted turn is legal when the player follows the coach`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        let g = createGame(setup(me), setup(tutorialFoe(me)), { seed })
        for (const step of TUTORIAL) {
          expect(legalActions(g, 'p1')).toContain(step.want)
          if (step.foe !== 'ai') expect(legalActions(g, 'p2')).toContain(step.foe)
          g = resolveTurn(g, { p1: step.want, p2: step.foe === 'ai' ? 'block' : step.foe })
          expect(g.winner).toBeNull()
        }
      }
    })
  }
  it('says who won the triangle', () => {
    expect(outcomeLine('strike', 'charge')).toMatch(/^Strike beats Charge/)
    expect(outcomeLine('strike', 'block')).toMatch(/^Block beats Strike/)
    expect(outcomeLine('block', 'block')).toBe('Both picked Block.')
  })
})

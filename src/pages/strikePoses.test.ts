import { describe, expect, it } from 'vitest'
import type { CardType } from '../engine/types'
import { newChain, strikePose } from './strikePoses'

const chain = (types: CardType[], crit: number[] = []) => {
  const count = newChain()
  return types.map((t, i) => strikePose(count, t, i, types.length, crit.includes(i)))
}

describe('strikePose', () => {
  it('walks the punch frames and ends a long P chain with the flurry', () => {
    expect(chain(['P', 'P', 'P', 'P', 'P'])).toEqual(['P', 'P2', 'P3', 'P', 'Pfin'])
    expect(chain(['P', 'P', 'P', 'P'])).toEqual(['P', 'P2', 'P3', 'Pfin'])
  })
  it('never shows one frame twice in a row', () => {
    for (const types of [['K', 'K', 'K', 'K', 'K'], ['S', 'S', 'S'], ['P', 'K', 'P', 'K', 'P']] as CardType[][]) {
      const poses = chain(types)
      poses.slice(1).forEach((p, i) => expect(p).not.toBe(poses[i]))
    }
  })
  it('keeps a short chain on the base frames and shows crits', () => {
    expect(chain(['P', 'K', 'S'])).toEqual(['P', 'K', 'S'])
    expect(chain(['S', 'S', 'S'], [2])).toEqual(['S', 'S2', 'crit'])
  })
})

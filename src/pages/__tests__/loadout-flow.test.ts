// Pre-battle steps (Q 2026-10-25): Champion → Path (Style + full Ascendancy) → Oath → Deck → Fight; no "no Style".
import { describe, expect, it } from 'vitest'
import { fillAsc, OATHS, randomLoadout, STYLES, TREES, treePoints, validAsc } from '../../engine'
import { dropOldTrees, firstOpenStep, loadoutGaps, loadoutFor, savedStyle, STEPS } from '../loadout/loadout'

const POINTS = 5
const style = 'AS:1'
const pts = treePoints(style, POINTS)
const oath = OATHS.AS[0].id
const fullTree = fillAsc(style, pts, [], () => 0)

describe('pre-battle steps', () => {
  it('runs in the order Q set', () => {
    expect([...STEPS]).toEqual(['champion', 'path', 'oath', 'deck', 'fight'])
  })

  it('an old save with no Style (or a Style that is gone) needs a Path first', () => {
    expect(savedStyle({ oath }, ['AS:1', 'AS:2'])).toBeUndefined()
    expect(savedStyle({ style: 'AS:9', oath }, ['AS:1', 'AS:2'])).toBeUndefined()
    expect(savedStyle({ style: 'AS:2' }, ['AS:1', 'AS:2'])).toBe('AS:2')
    expect(firstOpenStep('AS', undefined, POINTS, { oath })).toBe('path')
    expect(loadoutGaps('AS', undefined, POINTS, {})).toMatchObject({ style: true, oath: true })
  })

  it('an empty or half-spent tree blocks the Path step', () => {
    expect(firstOpenStep('AS', style, POINTS, { style, oath })).toBe('path')
    expect(loadoutGaps('AS', style, POINTS, { style, oath, asc: { [style]: ['A1'] } }).asc).toBe(pts - 1)
    // an illegal saved tree counts as empty
    expect(loadoutGaps('AS', style, POINTS, { style, asc: { [style]: ['A2'] } }).asc).toBe(pts)
  })

  it('a full tree with no Oath stops on Oath; with both it goes straight to Fight', () => {
    expect(firstOpenStep('AS', style, POINTS, { style, asc: { [style]: fullTree } })).toBe('oath')
    expect(firstOpenStep('AS', style, POINTS, { style, oath, asc: { [style]: fullTree } })).toBe('fight')
    expect(loadoutFor('AS', style, POINTS, { style, oath, asc: { [style]: fullTree } })).toEqual({ oath, asc: fullTree, points: pts })
  })

  it('a tree saved for an older rev is dropped, so the player picks it again', () => {
    const rev = Object.entries(TREES).find(([, t]) => t.rev)
    if (!rev) return
    const [s] = rev
    const saved = dropOldTrees({ style: s, asc: { [s]: ['A1'] } })
    expect(saved.asc?.[s]).toBeUndefined()
    expect(firstOpenStep(s.slice(0, 2), s, POINTS, { ...saved, oath: OATHS[s.slice(0, 2)][0].id })).toBe('path')
  })
})

describe('Quick build / AI tree', () => {
  it('fills every point from what is taken, legally, for every Style', () => {
    for (const s of Object.keys(TREES)) {
      const p = treePoints(s, POINTS)
      for (let seed = 0; seed < 5; seed++) {
        const r = (seed + 1) / 7
        const asc = fillAsc(s, p, ['B1'], () => r)
        expect(asc).toContain('B1')
        expect(asc).toHaveLength(p)
        expect(validAsc(asc, p, s)).toBe(true)
      }
    }
  })

  it('the AI always gets a Style that works and a full tree', () => {
    for (const s of Object.keys(TREES)) {
      expect(STYLES[s]).toBeTruthy()
      const l = randomLoadout(s.slice(0, 2), s, POINTS)
      expect(l.asc).toHaveLength(treePoints(s, POINTS))
      expect(l.oath).toBeTruthy()
    }
  })
})

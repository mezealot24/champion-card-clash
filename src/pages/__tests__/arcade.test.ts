import { describe, expect, it } from 'vitest'
import { ARCADE_STAGES, cleared, newRun, randomFoe, rollStages, tierOf, TIERS } from '../arcade/arcade'

const POOL = ['TK', 'BR', 'AS', 'MG'].flatMap((c) => [1, 2].map((n) => ({ champ: c, style: `${c}:${n}` })))
const seq = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

describe('Arcade ladder', () => {
  it('rolls 5 stages, no pair twice, never the same Champion back to back', () => {
    for (let s = 1; s < 200; s++) {
      const st = rollStages(POOL, ARCADE_STAGES, seq(s))
      expect(st).toHaveLength(ARCADE_STAGES)
      expect(new Set(st.map((f) => f.style)).size).toBe(ARCADE_STAGES)
      for (let i = 1; i < st.length; i++) expect(st[i].champ).not.toBe(st[i - 1].champ)
    }
  })

  it('repeats a small pool instead of failing', () => {
    expect(rollStages(POOL.slice(0, 1), 5)).toHaveLength(5)
    expect(rollStages([], 5)).toEqual([])
  })

  it('gets tougher every stage', () => {
    expect(TIERS).toHaveLength(ARCADE_STAGES)
    for (let i = 1; i < ARCADE_STAGES; i++) {
      const [a, b] = [tierOf(i - 1), tierOf(i)]
      expect(b.depth > a.depth || (b.depth === a.depth && b.noise < a.noise)).toBe(true)
    }
  })

  it('starts at stage 1 and is cleared after the last', () => {
    const r = newRun('BR', 'BR:1', POOL)
    expect(r.at).toBe(0)
    expect(cleared(r)).toBe(false)
    expect(cleared({ ...r, at: ARCADE_STAGES })).toBe(true)
  })

  it('Versus random picks from the pool', () => {
    expect(POOL).toContainEqual(randomFoe(POOL, seq(3)))
    expect(randomFoe([])).toBeUndefined()
  })
})

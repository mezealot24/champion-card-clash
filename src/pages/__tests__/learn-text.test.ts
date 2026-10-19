import { describe, expect, it } from 'vitest'
import { resolveTuning } from '../../engine/tuning'
import type { EffectSpec } from '../../engine/effects/spec'
import { comboInfo, comboSteps, compactRules, styleSummary } from '../learnText'

describe('compact card text', () => {
  it('splits a rule into when · gain · cost', () => {
    // BR-014: Before, you Strike + HP < 30% → +20 dmg; After, you Strike → Max HP −20
    const spec: EffectSpec = [
      { hook: 'modify', if: [{ c: 'selfAction', a: 'strike' }, { c: 'hp', who: 'self', op: '<', n: 30, pct: true }], do: [{ a: 'addDmg', target: 'this', n: 20 }] },
      { hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'maxHp', who: 'self', n: -20 }] },
    ]
    expect(compactRules(spec)).toEqual([
      { tag: 'BEFORE STRIKE', when: 'HP < 30%', gain: ['+20 dmg'], cost: [] },
      { tag: 'AFTER STRIKE', when: '', gain: [], cost: ['Max HP −20'] },
    ])
  })

  it('reads legacy onClean as AFTER + Clean hit, and names the resource', () => {
    const spec: EffectSpec = [{ hook: 'onClean', do: [{ a: 'draw', who: 'self', n: 1 }, { a: 'gainRes', who: 'self', n: 1 }] }]
    expect(compactRules(spec, 'Mana')).toEqual([{ tag: 'AFTER', when: 'Clean hit', gain: ['Draw 1', '+1 Mana'], cost: [] }])
  })

  it('counts hurting the foe as a gain and helping the foe as a cost', () => {
    const spec: EffectSpec = [{ hook: 'onHeld', if: [{ c: 'enemyAction', a: 'strike' }], do: [{ a: 'status', who: 'enemy', kind: 'silence', turns: 1 }, { a: 'draw', who: 'enemy', n: 1 }] }]
    expect(compactRules(spec)[0]).toMatchObject({ tag: 'HOLD', when: 'Foe Strikes', gain: ['Foe Silenced'], cost: ['Foe Draw 1'] })
  })
})

describe('combo tracker', () => {
  it('lights steps in any order, each card once', () => {
    expect(comboSteps(['P', 'K', 'P'], ['K', 'P'])).toEqual([true, true, false])
    expect(comboSteps(['P', 'K', 'P'], ['P', 'S', 'K', 'P'])).toEqual([true, true, true])
    expect(comboSteps(['S', 'S', 'S'], [])).toEqual([false, false, false])
  })

  it('reward text follows the tuning', () => {
    const t = resolveTuning({ TK: { comboHealPct: 15 } })
    expect(comboInfo('TK', 'TK:1', t)[0]).toMatchObject({ pattern: ['P', 'K', 'P'], reward: 'Heal 15% of your HP' })
    expect(comboInfo('MG', 'MG:2', t)[0].name).toBe('Absolute Zero')
  })
})

describe('Style one-liners', () => {
  it('fill every number from the tuning', () => {
    const t = resolveTuning({ 'BR:1': { bonusDmg: 12 } })
    expect(styleSummary('BR:1', t)).toBe('HP below 50%: slots 1–2 of your Strike deal +12 dmg.')
    expect(styleSummary('AS:2', t)).toContain('Every 4th attack')
    for (const key of ['TK:1', 'TK:2', 'BR:1', 'BR:2', 'AS:1', 'AS:2', 'MG:1', 'MG:2']) expect(styleSummary(key, t)).not.toMatch(/\{/)
  })
})

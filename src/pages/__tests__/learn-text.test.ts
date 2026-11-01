import { describe, expect, it } from 'vitest'
import { fillText, resolveTuning } from '../../engine/tuning'
import type { EffectSpec } from '../../engine/effects/spec'
import { comboInfo, comboSteps, compactRules, shortAct, shortCond } from '../learnText'
import { STYLE_SUMMARY } from '../select/info'

describe('compact card text', () => {
  it('splits a rule into timing, one line per condition, gain and cost', () => {
    // BR-014: Before, you Strike + HP < 30% → +20 dmg; After, you Strike → Max HP −20
    const spec: EffectSpec = [
      { hook: 'modify', if: [{ c: 'selfAction', a: 'strike' }, { c: 'hp', who: 'self', op: '<', n: 30, pct: true }], do: [{ a: 'addDmg', target: 'this', n: 20 }] },
      { hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'maxHp', who: 'self', n: -20 }] },
    ]
    expect(compactRules(spec)).toEqual([
      { tag: 'Before action', when: ['You play Strike', 'HP < 30%'], gain: ['+20 dmg'], cost: [] },
      { tag: 'After action', when: ['You play Strike'], gain: [], cost: ['Max HP −20'] },
    ])
  })

  it('reads legacy onClean as After action + Clean hit, and names the resource', () => {
    const spec: EffectSpec = [{ hook: 'onClean', do: [{ a: 'draw', who: 'self', n: 1 }, { a: 'gainRes', who: 'self', n: 1 }] }]
    expect(compactRules(spec, 'Mana')).toEqual([{ tag: 'After action', when: ['Clean hit'], gain: ['Draw 1', '+1 Mana'], cost: [] }])
  })

  it('counts hurting the foe as a gain and helping the foe as a cost', () => {
    const spec: EffectSpec = [{ hook: 'onHeld', if: [{ c: 'enemyAction', a: 'strike' }], do: [{ a: 'status', who: 'enemy', kind: 'silence', turns: 1 }, { a: 'draw', who: 'enemy', n: 1 }] }]
    expect(compactRules(spec)[0]).toMatchObject({ tag: 'After action', when: ["You don't Strike", 'Foe plays Strike'], gain: ['Foe Silenced'], cost: ['Foe Draw 1'] })
  })
})

describe('3 timings (Q 2026-10-28)', () => {
  it("Q's example: Before action / You play Strike / Foe can't Block", () => {
    const spec: EffectSpec = [{ hook: 'modify', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'status', who: 'enemy', kind: 'noBlock', turns: 1 }] }]
    expect(compactRules(spec)).toEqual([{ tag: 'Before action', when: ['You play Strike'], gain: ["Foe can't Block"], cost: [] }])
  })

  it('reads On hit as After action on a Strike, a draw as When appear, Hold at turn start as Before action', () => {
    const heal = [{ a: 'heal', who: 'self', n: 10 }] as EffectSpec[number]['do']
    expect(compactRules([{ hook: 'onHit', if: [{ c: 'enteredAt', n: 1 }], do: heal }])[0]).toMatchObject({ tag: 'After action', when: ['You play Strike', 'Drawn into slot 1'] })
    expect(compactRules([{ hook: 'onDraw', if: [{ c: 'enteredAt', n: 1 }], do: heal }])[0]).toMatchObject({ tag: 'When appear', when: ['Drawn into slot 1'], gain: ['Heal 10'] })
    expect(compactRules([{ hook: 'onHeld', at: 'before', do: heal }])[0]).toMatchObject({ tag: 'Before action', when: ["You don't Strike"] })
    expect(compactRules([{ hook: 'onHeld', if: [{ c: 'selfAction', a: 'charge' }], do: heal }])[0].when).toEqual(['You play Charge'])
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
    const line = (key: string) => fillText(STYLE_SUMMARY[key], key, t)
    expect(line('BR:1')).toBe('Warm-up at 5+ Rage: first 2 chain cards +4 dmg. Below 50% HP: True Fury +12; stopped hits chip 5 and give 2 Rage.')
    expect(line('AS:2')).toContain('Every 4th attack')
    for (const key of ['TK:1', 'TK:2', 'BR:1', 'BR:2', 'AS:1', 'AS:2', 'MG:1', 'MG:2']) expect(line(key)).not.toMatch(/\{/)
    expect(line('MG:1')).toContain('⟡ Infuses 1 Ignite')
  })
})

describe('⟡ Infuse short forms', () => {
  it('reads the new action and conditions in a few words', () => {
    expect(shortAct({ a: 'infuse', who: 'enemy', n: 2 })).toBe('⟡ Infuse 2')
    expect(shortCond({ c: 'fieldAll', who: 'self', type: 'S' })).toBe('Field all S')
    expect(shortCond({ c: 'handCompare', op: '<=' })).toBe('No more cards than foe')
  })
})

import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { heal } from '../state'
import { rulesFromConfig } from '../tuning'

const setup = (championId: string) => ({ championId, hpStart: 200, hpMax: 200, deck: [] })

describe('Sudden death (Q 2026-10-27)', () => {
  it('after turn N both sides lose dmg × turns past N, and heals are cut once it starts', () => {
    let s = createGame(setup('TK'), setup('TK'), { seed: 1, rules: { suddenDeathTurn: 2, suddenDeathDmg: 3, suddenDeathHealCut: 50 } })
    s = resolveTurn(s, { p1: 'block', p2: 'block' }) // T1
    s = resolveTurn(s, { p1: 'block', p2: 'block' }) // T2
    expect(s.players.p1.hp).toBe(200)
    s = resolveTurn(s, { p1: 'block', p2: 'block' }) // T3: −3
    expect([s.players.p1.hp, s.players.p2.hp]).toEqual([197, 197])
    s = resolveTurn(s, { p1: 'block', p2: 'block' }) // T4: −6
    expect(s.players.p1.hp).toBe(191)
    expect(heal(s, 'p1', 8)).toBe(4)
  })
  it('both dropping to 0 together is a draw; 0 turns = off', () => {
    let s = createGame(setup('TK'), setup('TK'), { seed: 1, rules: { suddenDeathTurn: 1, suddenDeathDmg: 500, suddenDeathHealCut: 0 } })
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(s.winner).toBe('draw')
    let off = createGame(setup('TK'), setup('TK'), { seed: 1, rules: { suddenDeathTurn: 0 } })
    for (let i = 0; i < 40; i++) off = resolveTurn(off, { p1: 'block', p2: 'block' })
    expect(off.players.p1.hp).toBe(200)
  })
  it('game_config keys map to the rules', () => {
    expect(rulesFromConfig([{ key: 'sudden_death_turn', value: 25 }, { key: 'sudden_death_dmg', value: 4 }, { key: 'sudden_death_heal_cut', value: 30 }])).toEqual({ suddenDeathTurn: 25, suddenDeathDmg: 4, suddenDeathHealCut: 30 })
  })
})

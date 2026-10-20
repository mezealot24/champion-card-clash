// Loadout: Sigil I · Oath, Sigil II · Minor, Ascendancy nodes (engine/loadout.ts).
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, MINORS, OATHS, pickAiAction, resolveTurn, TREES, validAsc } from '../index'
import type { Action, CardDef, CardInst, GameState, Loadout } from '../index'
import { tuningOf } from '../tuning'

let uid = 0
const hit = (dmg: number, type: 'P' | 'K' | 'S' = 'P'): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 12 }, (_, i): CardDef => ({ id: `XX-${i}`, type: (['P', 'K', 'S'] as const)[i % 3], dmg: 4, effectText: '' }))
const HP: Record<string, number> = { TK: 250, BR: 210, AS: 160, MG: 130 }

function game(champ: string, loadout: Loadout | undefined, style?: string, foe = 'XX'): GameState {
  return createGame(
    { championId: champ, hpStart: HP[champ] ?? 100, hpMax: HP[champ] ?? 100, deck, style, loadout },
    { championId: foe, hpStart: HP[foe] ?? 100, hpMax: HP[foe] ?? 100, deck, style: foe !== 'XX' ? style : undefined },
    { seed: 3 },
  )
}

describe('loadout', () => {
  it('every Oath, Minor and node starts and plays 30 turns without breaking', () => {
    const acts: Action[] = ['charge', 'charge', 'strike', 'block', 'charge', 'strike']
    const run = (s: GameState) => {
      for (let i = 0; i < 30 && !s.winner; i++) {
        const legal = legalActions(s, 'p1')
        const a = legal.includes(acts[i % acts.length]) ? acts[i % acts.length] : legal[0]
        s = resolveTurn(s, { p1: a, p2: pickAiAction(s, 'p2') })
      }
    }
    for (const [champ, oaths] of Object.entries(OATHS))
      for (const o of oaths) for (const m of MINORS) run(game(champ, { oath: o.id, minor: m.id }, `${champ}:1`, champ))
    for (const style of Object.keys(TREES)) {
      const champ = style.slice(0, 2)
      for (const b of ['A', 'B']) run(game(champ, { asc: [1, 2, 3, 4].map((n) => `${b}${n}`) }, style, champ))
    }
  })

  it('Ascendancy: top-down per branch, at most the points', () => {
    expect(validAsc(['A1', 'A2', 'B1'], 5)).toBe(true)
    expect(validAsc(['A2'], 5)).toBe(false)
    expect(validAsc(['A1', 'A2', 'A3', 'A4', 'B1', 'B2'], 5)).toBe(false)
    // an illegal tree is ignored, not half-applied
    expect(game('TK', { asc: ['A2'] }, 'TK:1').players.p1.perks).toBeUndefined()
  })

  it('a node changes only its owner\'s numbers (mirror match)', () => {
    const s = game('TK', { asc: ['A1'] }, 'TK:1', 'TK')
    expect(tuningOf(s, 'p1')['TK:1'].hpPct).toBe(35)
    expect(tuningOf(s, 'p2')['TK:1'].hpPct).toBe(30)
  })

  it('Deep Roots: +40 Max HP, Field holds 4', () => {
    let s = game('TK', { oath: 'o2' })
    expect(s.players.p1.maxHp).toBe(290)
    for (let i = 0; i < 6; i++) s = resolveTurn(s, { p1: 'charge', p2: 'block' })
    expect(s.players.p1.hand.length).toBe(4)
  })

  it('Bulwark Oath: the first Block stops every hit, then Blocks are normal', () => {
    let s = game('TK', { oath: 'o1' })
    s.players.p2.hand = [hit(10), hit(10), hit(10), hit(10)]
    s = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(250)
    s.players.p2.hand = [hit(10), hit(10), hit(10)]
    s = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(s.players.p1.hp).toBe(240)
  })

  it('Iron Hide: every hit past Block deals 2 less', () => {
    let s = game('BR', { oath: 'o3' })
    s.players.p2.hand = [hit(10), hit(10)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(s.players.p1.hp).toBe(210 - 16)
  })

  it('Hot Blood starts with 10 Rage and 20 less Max HP; Head Start adds 1 resource', () => {
    const s = game('BR', { oath: 'o2', minor: 'm2' })
    expect(s.players.p1.res).toBe(11)
    expect(s.players.p1.maxHp).toBe(190)
  })

  it('Arcane Ward: Shield 20 at the start, S cards cost 1 more Mana', () => {
    let s = game('MG', { oath: 'o2' })
    expect(s.players.p1.statuses.find((x) => x.kind === 'shield')?.n).toBe(20)
    s.players.p1.res = 2
    s.players.p1.hand = [hit(5, 'S')]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.res).toBe(2) // default S cost 2 + 1 = 3 > 2: unpaid
  })

  it('Unbroken: a knockout hit leaves the Tank at 1 HP once', () => {
    let s = game('TK', { asc: ['B1', 'B2', 'B3', 'B4'] }, 'TK:1')
    s.players.p1.hp = 5
    s.players.p2.hand = [hit(50)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    // stays at 1, then Lifeline heals in the red
    expect(s.players.p1.hp).toBeGreaterThanOrEqual(1)
    expect(s.players.p1.perkData?.unbroken).toBe(1)
    expect(s.winner).toBeNull()
  })
})

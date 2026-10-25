// Assassin Ascendancy v2 (Q 2026-10-25, design/assassin-ascendancy-v2-2026-10-25.md): Sonic Bliz + Fatal Rhythm.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn, TREES } from '../index'
import { isDebuff } from '../styles'
import type { CardDef, CardInst, GameState } from '../index'
import type { EffectSpec } from '../effects/spec'
import { tuningOf } from '../tuning'

let uid = 0
const hit = (dmg: number, type: 'P' | 'K' | 'S' = 'P', effectSpec: EffectSpec | null = null): CardInst => ({ uid: `a${uid++}`, def: { id: `AA-${uid}`, type, dmg, effectText: '', effectSpec } })
const deck = Array.from({ length: 12 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'P', dmg: 1, effectText: '' }))
const as = (style: string, asc: string[]): GameState =>
  createGame({ championId: 'AS', hpStart: 160, hpMax: 160, deck, style, loadout: { asc, points: 6 } }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 3 })
const t = (s: GameState, style: string) => tuningOf(s, 'p1')[style as 'AS:1'] as Record<string, number>
const said = (s: GameState, text: string) => s.log.some((l) => l.includes(text))

describe('Assassin v2 Ascendancy', () => {
  it('both trees: 4 branches × 3, 6 points', () => {
    for (const k of ['AS:1', 'AS:2']) {
      expect(TREES[k].branches).toHaveLength(4)
      expect(TREES[k].depth).toBe(3)
      expect(TREES[k].bonusPoints).toBe(1)
      expect(TREES[k].nodes).toHaveLength(12)
      expect(TREES[k].nodes.filter((n) => n.cost)).toHaveLength(4)
    }
  })

  describe('Sonic Bliz', () => {
    it('Afterburner: Energy back after an Overdrive; Acceleration no longer fills', () => {
      let s = as('AS:1', ['A1', 'A2', 'A3'])
      expect(t(s, 'AS:1').minChain).toBe(2)
      s.players.p1.res = 3
      s.players.p1.hand = [hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Afterburner')).toBe(true)
      expect(s.players.p1.res).toBe(3) // 0 after Overdrive, +1 a turn, +2 Afterburner
      s.players.p1.res = 0
      s.players.p1.hand = [hit(1, 'S')]
      s.players.p2.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'strike' })
      expect(s.players.p1.res).toBeLessThan(3)
    })

    it('Mach Speed: Acceleration on Strike into Charge, one fewer card at start', () => {
      let s = as('AS:1', ['B1', 'B2', 'B3'])
      expect(s.players.p1.hand).toHaveLength(2)
      s.players.p1.res = 0
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Mach Speed')).toBe(true)
      expect(s.players.p1.res).toBe(3)
    })

    it('Slipstream: hits deal 2 less only when Strike meets Strike', () => {
      let s = as('AS:1', ['B1', 'B2'])
      s.players.p1.hand = [hit(1)]
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'strike', p2: 'strike' })
      expect(160 - s.players.p1.hp).toBe(8)
    })

    it('Escape Artist: a Block that stops every hit gives Energy', () => {
      let s = as('AS:1', ['C1'])
      s.players.p1.res = 0
      s.players.p2.hand = [hit(5), hit(5)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.players.p1.res).toBe(2) // +1 Escape Artist, +1 a turn
    })

    it('Ghost Veil: +1 a quiet turn up to 3, cuts dmg, gone after a hit', () => {
      let s = as('AS:1', ['C1', 'C2'])
      for (let i = 0; i < 4; i++) s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
      expect(s.players.p1.perkData?.veil).toBe(3)
      const hp = s.players.p1.hp
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(hp - s.players.p1.hp).toBe(7)
      expect(s.players.p1.perkData?.veil).toBe(0)
    })

    it('Wraith Form: Surge at 2 Energy, −20 Max HP', () => {
      let s = as('AS:1', ['C1', 'C2', 'C3'])
      expect(s.players.p1.maxHp).toBe(140)
      s.players.p1.res = 2
      s = resolveTurn(s, { p1: 'block', p2: 'charge' })
      expect(said(s, 'Energy Surge')).toBe(true)
    })

    it('Snare and Tripwire Cut the newest card on Charge vs Block', () => {
      let s = as('AS:1', ['D1', 'D2'])
      s.players.p2.hand = [hit(1), hit(1), hit(1)]
      const newest = s.players.p2.hand[2].uid
      s = resolveTurn(s, { p1: 'charge', p2: 'block' })
      expect(s.players.p2.hand.map((c) => c.uid)).not.toContain(newest)
      expect(said(s, 'Snare')).toBe(true)
      s = resolveTurn(s, { p1: 'block', p2: 'charge' })
      expect(said(s, 'Tripwire')).toBe(true)
    })

    it('Demolition: Cut cards Cut 1 more and deal 2 less', () => {
      let s = as('AS:1', ['D1', 'D2', 'D3'])
      const rule: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'cut', which: 'oldest', n: 1 }] }]
      s.players.p1.hand = [hit(5, 'P', rule)]
      s.players.p2.hand = [hit(1), hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(100 - s.players.p2.hp).toBe(3)
      expect(s.players.p2.discarded?.filter((d) => d.reason === 'Cut')).toHaveLength(2)
    })
  })

  describe('Fatal Rhythm', () => {
    it('Executioner: a Critical that leaves the enemy at 10% or less finishes them; ×2 above the line', () => {
      let s = as('AS:2', ['A1', 'A2', 'A3'])
      expect(t(s, 'AS:2').critMult).toBe(2)
      s.players.p1.styleData = { attacks: 3 }
      s.players.p2.hp = 30
      s.players.p1.hand = [hit(4)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p2.hp).toBe(0)
      expect(said(s, 'Executioner')).toBe(true)
    })

    it('Crescendo: every 3rd, ×2 / ×3; Off-Beat counts stopped hits up to 2', () => {
      let s = as('AS:2', ['B1', 'B2', 'B3'])
      expect(t(s, 'AS:2').every).toBe(3)
      expect(t(s, 'AS:2').critMult).toBe(2)
      expect(t(s, 'AS:2').redCritMult).toBe(3)
      expect(s.players.p1.styleData?.attacks).toBe(2)
      s.players.p2.hand = [hit(1), hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.players.p1.styleData?.attacks).toBe(4)
    })

    it('Toxic Strike: Venom per Critical (capped), burns 1 per stack and fades by 1; it is a debuff', () => {
      let s = as('AS:2', ['C1', 'C2'])
      s.players.p1.styleData = { attacks: 3 }
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      const v = s.players.p2.statuses.find((x) => x.kind === 'venom')!
      expect(v.n).toBe(1) // 2 given, 2 burned, 1 fades
      expect(said(s, 'enemy loses 2 HP')).toBe(true)
      expect(isDebuff(v)).toBe(true)
      v.n = 9
      s.players.p1.styleData = { attacks: 3 }
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(said(s, 'Venom 6/6')).toBe(true)
    })

    it('Virulent: +1 dmg per card at 3+ Venom', () => {
      let s = as('AS:2', ['C1', 'C2'])
      s.players.p2.statuses.push({ kind: 'venom', turns: 9999, n: 3 })
      s.players.p1.hand = [hit(4)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Virulent')).toBe(true)
    })

    it('Noxious: Venom stays and burns double; blocked Criticals deal 0 even with Feint', () => {
      let s = as('AS:2', ['C1', 'C2', 'C3', 'D1'])
      expect(t(s, 'AS:2').blockedCritPct).toBe(0)
      s.players.p2.statuses.push({ kind: 'venom', turns: 9999, n: 3 })
      s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
      expect(100 - s.players.p2.hp).toBe(6)
      expect(s.players.p2.statuses.find((x) => x.kind === 'venom')?.n).toBe(3)
    })

    it('Ghost Dance gives Parry after a Critical; Unseen Strike: Criticals ignore Block, every 5th', () => {
      let s = as('AS:2', ['D1', 'D2', 'D3'])
      expect(t(s, 'AS:2').every).toBe(5)
      s.players.p1.styleData = { attacks: 4 }
      s.players.p1.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(100 - s.players.p2.hp).toBe(15)
      expect(s.players.p1.statuses.some((x) => x.kind === 'parry')).toBe(true)
    })
  })
})

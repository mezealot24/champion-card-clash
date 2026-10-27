// Bruiser Ascendancy v2 (Q 2026-10-25, design/bruiser-ascendancy-v2-2026-10-25.md): Fury + Juggernaut.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn, TREES } from '../index'
import type { CardDef, CardInst, GameState } from '../index'
import { tuningOf } from '../tuning'
import { dropOldTrees } from '../../pages/loadout/loadout'

let uid = 0
const hit = (dmg: number, type: 'P' | 'K' | 'S' = 'P'): CardInst => ({ uid: `b${uid++}`, def: { id: `BB-${uid}`, type, dmg, effectText: '' } })
const deck = Array.from({ length: 12 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'K', dmg: 1, effectText: '' }))
const br = (style: string, asc: string[]): GameState => {
  const s = createGame({ championId: 'BR', hpStart: 210, hpMax: 210, deck, style, loadout: { asc, points: 6 } }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 3 })
  s.players.p1.hand = []
  s.players.p2.hand = []
  return s
}
const t = (s: GameState, style: string) => tuningOf(s, 'p1')[style as 'BR:1'] as Record<string, number>
const said = (s: GameState, text: string) => s.log.some((l) => l.includes(text))
const woundUp = (s: GameState) => s.players.p1.statuses.some((x) => x.kind === 'woundUp')

describe('Bruiser v2 Ascendancy', () => {
  it('both trees: 4 branches × 3, 6 points, a new rev', () => {
    for (const k of ['BR:1', 'BR:2']) {
      expect(TREES[k].branches).toHaveLength(4)
      expect(TREES[k].depth).toBe(3)
      expect(TREES[k].bonusPoints).toBe(1)
      expect(TREES[k].rev).toBe(3)
      expect(TREES[k].nodes).toHaveLength(12)
      expect(TREES[k].nodes.filter((n) => n.cost)).toHaveLength(4)
    }
  })

  it('a Bruiser tree saved before v2 is dropped, other trees stay', () => {
    const l = dropOldTrees({ asc: { 'BR:1': ['A1', 'A2', 'A3', 'B1', 'B2'], 'MG:1': ['A1'] } })
    expect(l.asc).toEqual({ 'MG:1': ['A1'] })
    expect(dropOldTrees({ asc: { 'BR:1': ['A1'] }, ascRev: { 'BR:1': 3 } }).asc).toEqual({ 'BR:1': ['A1'] })
  })

  describe('Fury', () => {
    it('Bloodbath: Fury on every slot; hits reach you +2 while Fury is on', () => {
      let s = br('BR:1', ['A1', 'A2', 'A3'])
      expect(t(s, 'BR:1').slots).toBe(5)
      expect(t(s, 'BR:1').hpPct).toBe(60)
      s.players.p1.hp = 100
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(100 - s.players.p1.hp).toBe(12)
    })

    it('Short Fuse: the first time Fury turns on, +5 Rage (once)', () => {
      let s = br('BR:1', ['A1'])
      s.players.p1.hp = 100 // 48% < 60%
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.res).toBe(5)
      expect(said(s, 'Short Fuse')).toBe(true)
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.log.filter((l) => l.includes('Short Fuse'))).toHaveLength(1)
    })

    it('Heavy Hands: every card +1, +3 while Fury is on', () => {
      let s = br('BR:1', ['A1', 'A2'])
      s.players.p1.hand = [hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Heavy Hands: every chain card +1')).toBe(true)
      s.players.p1.hp = 100
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Heavy Hands: every chain card +3')).toBe(true)
    })

    it('Seething: +1 Rage per HP loss of any kind and per clean hit', () => {
      const s = br('BR:1', ['B1'])
      const b = tuningOf(s, 'p1').BR
      expect([b.perHitTaken, b.perSelfDmg, b.perCleanHit]).toEqual([3, 2, 2])
    })

    it('War Cry: every chain card +1 per 5 Rage, max +3 a card', () => {
      let s = br('BR:1', ['B1', 'B2'])
      s.players.p1.res = 20
      s.players.p1.hand = [hit(10), hit(10)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(100 - s.players.p2.hp).toBe(26 + 8) // + Fury Warm-up 4 on slots 1-2 (Rage 5+)
    })

    it('Blood Rite: Rage cap 30, no quiet-turn loss, no HP burn; Block stops 1 fewer hit', () => {
      let s = br('BR:1', ['B1', 'B2', 'B3'])
      expect(tuningOf(s, 'p1').BR.cap).toBe(30)
      s.players.p1.res = 25
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.res).toBe(25)
      expect(s.players.p1.hp).toBe(210)
      s.players.p2.hand = [hit(5), hit(5)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.players.p1.hp).toBe(205) // 2nd hit gets through
    })

    it('One-Two: every 2nd P card +3', () => {
      let s = br('BR:1', ['C1'])
      s.players.p1.hand = [hit(1), hit(1), hit(1, 'K'), hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(100 - s.players.p2.hp).toBe(5 + 6)
    })

    it('Payback: Charge with Rage → Wound Up; next Strike slot 1 spends the Rage the S cards left', () => {
      let s = br('BR:1', ['C1', 'C2'])
      s.players.p1.res = 15
      s = resolveTurn(s, { p1: 'charge', p2: 'block' })
      expect(woundUp(s)).toBe(true)
      s.players.p1.res = 20
      s.players.p1.hand = [hit(10), hit(16, 'K'), hit(30, 'S')]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Payback: 10 Rage')).toBe(true)
      expect(100 - s.players.p2.hp).toBe(20 + 16 + 30 + 8) // + Fury Warm-up 4 on slots 1-2
      expect(woundUp(s)).toBe(false)
    })

    it('Payback: Block stops it (slot 1); Wound Up lasts one turn', () => {
      let s = br('BR:1', ['C1', 'C2'])
      s.players.p1.res = 10
      s = resolveTurn(s, { p1: 'charge', p2: 'block' })
      s.players.p1.res = 10
      s.players.p1.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(s.players.p2.hp).toBe(100)
      s = br('BR:1', ['C1', 'C2'])
      s.players.p1.res = 10
      s = resolveTurn(s, { p1: 'charge', p2: 'block' })
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(woundUp(s)).toBe(false)
    })

    it('Wind Up interrupted: hit while Charging → no Wound Up, +10 Rage', () => {
      let s = br('BR:1', ['C1', 'C2'])
      s.players.p1.res = 4
      s.players.p2.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(woundUp(s)).toBe(false)
      expect(said(s, 'Wind Up interrupted')).toBe(true)
      expect(s.players.p1.res).toBeGreaterThanOrEqual(14)
    })

    it('Knockout: Payback ignores Block, Shield half the Rage, Fury bonus −4', () => {
      let s = br('BR:1', ['C1', 'C2', 'C3'])
      expect(t(s, 'BR:1').bonusDmg).toBe(6)
      s.players.p1.res = 10
      s = resolveTurn(s, { p1: 'charge', p2: 'block' })
      s.players.p1.res = 10
      s.players.p1.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(100 - s.players.p2.hp).toBe(15 + 4) // + Fury Warm-up 4 on slot 1
      expect(s.players.p1.statuses.find((x) => x.kind === 'shield')?.n).toBe(5)
    })

    it('Underdog: +1 every card while the enemy has more HP', () => {
      let s = br('BR:1', ['D1', 'D2'])
      s.players.p1.hp = 90
      s.players.p1.hand = [hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(100 - s.players.p2.hp).toBe(2 + 2 + 20) // + Fury 10 on slots 1-2
    })

    it('Rally: a Strike taking 15%+ of Max HP heals 4 + 10% missing; −15 Max HP', () => {
      let s = br('BR:1', ['D1', 'D2', 'D3'])
      expect(s.players.p1.maxHp).toBe(195)
      expect(t(s, 'BR:1').hpPct).toBe(50)
      s.players.p1.hp = 115
      s.players.p1.hand = [hit(20)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p1.hp).toBe(115 + 4 + 8) // 10% of 80 missing
    })
  })

  describe('Juggernaut', () => {
    it('Take the Hit: after the enemy Strikes you, next slot 1 +4', () => {
      let s = br('BR:2', ['A1'])
      s.players.p2.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Take the Hit: slot 1 +4')).toBe(true)
    })

    it('Riposte: a full Block powers every card of the next Strike', () => {
      let s = br('BR:2', ['A1', 'A2'])
      expect(t(s, 'BR:2').blockLoss).toBe(tuningOf(br('BR:2', []), 'p1')['BR:2'].blockLoss - 1)
      s.players.p2.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      s.players.p1.hand = [hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Riposte: every chain card +2')).toBe(true)
    })

    it('Retaliation: blocked hits give Momentum (max 2 a turn), Lifesteal −5', () => {
      let s = br('BR:2', ['A1', 'A2', 'A3'])
      expect(t(s, 'BR:2').omnivampPct).toBe(5)
      s.players.p2.hand = [hit(5), hit(5), hit(5)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.players.p1.comboData?.conqueror).toBe(2) // +2, Riposte: Block costs 0
    })

    it('Retaliation · Sunder: Strike takes 2 enemy Shield per Momentum (max 8)', () => {
      let s = br('BR:2', ['A1', 'A2', 'A3'])
      s.players.p1.comboData = { conqueror: 3 }
      s.players.p2.statuses.push({ kind: 'shield', turns: 3, n: 10 })
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(said(s, 'Sunder: took 8 Shield')).toBe(true) // Strike makes it 4 Momentum → 8 (cap)
    })

    it('Bloodhound: putting the enemy in the red gives +3 Momentum once', () => {
      let s = br('BR:2', ['B1', 'B2'])
      s.players.p2.hp = 40
      s.players.p1.hand = [hit(15)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p1.comboData?.conqueror).toBe(4)
    })

    it('Final Verdict: at max Momentum, leaving the enemy at 15% or less finishes them; max +1', () => {
      let s = br('BR:2', ['B1', 'B2', 'B3'])
      expect(t(s, 'BR:2').conquerorMax).toBe(7)
      s.players.p1.comboData = { conqueror: 7 }
      s.players.p2.hp = 20
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p2.hp).toBe(0)
      expect(s.winner).toBe('p1')
    })

    it('Gorged: hits cut 2 at max Momentum', () => {
      let s = br('BR:2', ['C1', 'C2'])
      s.players.p1.comboData = { conqueror: 6 }
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(said(s, 'Momentum')).toBe(true)
      expect(210 - s.players.p1.hp).toBeLessThan(13)
    })

    it('Insatiable: Lifesteal from 3 stacks, −20 Max HP', () => {
      let s = br('BR:2', ['C1', 'C2', 'C3'])
      expect(s.players.p1.maxHp).toBe(190)
      s.players.p1.hp = 100
      s.players.p1.comboData = { conqueror: 1 }
      s.players.p1.hand = [hit(20), hit(20)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p1.hp).toBeGreaterThan(100)
    })

    it('Gorged works with Insatiable below max (Lifesteal from 3 stacks)', () => {
      let s = br('BR:2', ['C1', 'C2', 'C3'])
      s.players.p1.comboData = { conqueror: 3 }
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(190 - s.players.p1.hp).toBe(8)
    })

    it('Plating: after a turn you were hit, hits deal 2 less', () => {
      let s = br('BR:2', ['D1'])
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      const was = s.players.p1.hp
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(was - s.players.p1.hp).toBe(8)
    })

    it('Iron Grip: every 3 turns a Strike heals 4 and +2 Max HP', () => {
      let s = br('BR:2', ['D1', 'D2'])
      s.players.p1.hp = 150
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Iron Grip: heals 4, Max HP +2')).toBe(true)
      expect(s.players.p1.maxHp).toBe(212)
    })

    it('Quake: no Tenacity; at max Momentum hits cut 3 for 2 turns, then the enemy loses 10', () => {
      let s = br('BR:2', ['D1', 'D2', 'D3'])
      expect(t(s, 'BR:2').tenacityTurns).toBe(0)
      s.players.p1.comboData = { conqueror: 5 }
      s.players.p1.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(said(s, 'Quake: hits deal 3 less')).toBe(true)
      const foe = s.players.p2.hp
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(foe - s.players.p2.hp).toBe(10)
    })
  })
})

// Loadout: Sigil I · Oath, Sigil II · Minor, Ascendancy nodes (engine/loadout.ts).
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, MINORS, OATHS, pickAiAction, randomLoadout, resolveTurn, TREES, treePoints, treeShape, validAsc } from '../index'
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
      const { letters, depth } = treeShape(style)
      for (const b of letters) run(game(champ, { asc: Array.from({ length: depth }, (_, i) => `${b}${i + 1}`), points: treePoints(style, 5) }, style, champ))
    }
  })

  it('Ascendancy: top-down per branch, at most the points', () => {
    expect(validAsc(['A1', 'A2', 'B1'], 5)).toBe(true)
    expect(validAsc(['A2'], 5)).toBe(false)
    expect(validAsc(['A1', 'A2', 'A3', 'A4', 'B1', 'B2'], 5)).toBe(false)
    // Mage v2: 4 branches (A-D) × 3 nodes, 5 + 1 points
    expect(treePoints('MG:1', 5)).toBe(6)
    expect(treePoints('TK:1', 5)).toBe(6)
    expect(treePoints('BR:1', 5)).toBe(6)
    expect(validAsc(['A1', 'A2', 'A3', 'D1', 'D2', 'D3'], 6, 'MG:2')).toBe(true)
    expect(validAsc(['A1', 'A2', 'A3', 'A4'], 6, 'MG:2')).toBe(false)
    expect(validAsc(['C1', 'D1'], 6, 'TK:1')).toBe(true)
    expect(validAsc(['C1', 'D1'], 6, 'BR:1')).toBe(true)
    expect(validAsc(['A1', 'A2', 'A3', 'A4'], 6, 'BR:2')).toBe(false)
    const r = randomLoadout('MG', 'MG:1', 5, () => 0.99)
    expect(r.asc?.length).toBe(6)
    // an illegal tree is ignored, not half-applied
    expect(game('TK', { asc: ['A2'] }, 'TK:1').players.p1.perks).toBeUndefined()
  })

  it('a node changes only its owner\'s numbers (mirror match)', () => {
    const s = game('TK', { asc: ['B1'] }, 'TK:1', 'TK')
    expect(tuningOf(s, 'p1')['TK:1'].hpPct).toBe(35)
    expect(tuningOf(s, 'p2')['TK:1'].hpPct).toBe(30)
  })

  it('Deep Roots: +40 Max HP, no Cost (Field still holds 5)', () => {
    let s = game('TK', { oath: 'o2' })
    expect(s.players.p1.maxHp).toBe(290)
    for (let i = 0; i < 6; i++) s = resolveTurn(s, { p1: 'charge', p2: 'block' })
    expect(s.players.p1.hand.length).toBe(5)
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

  it('Hot Blood starts with 10 Rage and no Max HP Cost; Head Start adds 1 resource', () => {
    const s = game('BR', { oath: 'o2', minor: 'm2' })
    expect(s.players.p1.res).toBe(11)
    expect(s.players.p1.maxHp).toBe(210)
  })

  it('Arcane Ward: Shield 20 at the start, S cards cost no more Mana', () => {
    let s = game('MG', { oath: 'o2' })
    expect(s.players.p1.statuses.find((x) => x.kind === 'shield')?.n).toBe(20)
    s.players.p1.res = 2
    s.players.p1.hand = [hit(5, 'S')]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.res).toBeLessThan(2) // paid the normal cost
  })

  it('Unbroken: a knockout hit leaves the Tank at 1 HP once', () => {
    let s = game('TK', { asc: ['D1', 'D2', 'D3'] }, 'TK:1')
    s.players.p1.hp = 5
    s.players.p2.hand = [hit(50)]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    // stays at 1, then Lifeline heals in the red
    expect(s.players.p1.maxHp).toBe(220) // Cost: −30 Max HP
    expect(s.players.p1.hp).toBeGreaterThanOrEqual(1)
    expect(s.players.p1.perkData?.unbroken).toBe(1)
    expect(s.winner).toBeNull()
  })
})

describe('randomLoadout', () => {
  it('rolls a legal full loadout for every Style', async () => {
    const { randomLoadout } = await import('../index')
    for (const style of Object.keys(TREES)) {
      const champ = style.split(':')[0]
      for (let i = 0; i < 30; i++) {
        const l = randomLoadout(champ, style, 5)
        expect(OATHS[champ].some((o) => o.id === l.oath)).toBe(true)
        expect(l.minor).toBeUndefined() // Sigil II · Minor is off
        expect(l.asc).toHaveLength(treePoints(style, 5))
        expect(validAsc(l.asc!, treePoints(style, 5), style)).toBe(true)
      }
    }
    expect(randomLoadout('TK', undefined, 5).asc).toEqual([])
  })

  describe('Mage v2 Ascendancy', () => {
    const mg = (style: string, asc: string[]) => game('MG', { asc, points: 6 }, style, 'MG')
    it('Shatterpoint changes only the Cryomancer\'s own numbers, Cost included', () => {
      const s = mg('MG:2', ['A1', 'A2', 'A3'])
      expect(tuningOf(s, 'p1')['MG:2'].chillMax).toBe(3)
      expect(tuningOf(s, 'p1')['MG:2'].frostArmorShield).toBe(20)
      expect(tuningOf(s, 'p2')['MG:2'].chillMax).toBe(4)
    })
    it('Eternal Winter: Chill stacks past the freeze line and never freezes', () => {
      const s = mg('MG:2', ['B1', 'B2', 'B3'])
      expect(tuningOf(s, 'p1')['MG:2'].chillNoFreeze).toBe(1)
      expect(tuningOf(s, 'p1')['MG:2'].chillMax).toBe(6)
    })
    it('Eruption takes away Molten Shield Ignite; Rebirth costs Max HP', () => {
      expect(tuningOf(mg('MG:1', ['C1', 'C2', 'C3']), 'p1')['MG:1'].moltenIgnite).toBe(0)
      expect(mg('MG:1', ['D1', 'D2', 'D3']).players.p1.maxHp).toBe(110)
    })
    it('Hoarfrost tops Shield up to its cap, as one Shield', () => {
      let s = mg('MG:2', ['C1'])
      s.players.p1.statuses = s.players.p1.statuses.filter((x) => x.kind !== 'shield') // no Frost Armor
      for (let i = 0; i < 12; i++) s = resolveTurn(s, { p1: 'block', p2: 'charge' })
      const shields = s.players.p1.statuses.filter((x) => x.kind === 'shield')
      expect(shields.reduce((t, x) => t + (x.n ?? 0), 0)).toBe(24)
      expect(shields.length).toBe(1)
    })
  })

  describe('Tank v2 Ascendancy', () => {
    const tk = (style: string, asc: string[]) => game('TK', { asc, points: 6 }, style, 'TK')
    it('Endurance: Charge or 2+ hits give a stack, each cuts 2 dmg per hit, regens, capped, fades', () => {
      let s = tk('TK:1', ['A1'])
      for (let i = 0; i < 4; i++) {
        s.players.p2.hand = [hit(10), hit(10)]
        s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      }
      expect(s.players.p1.perkData?.endurance).toBe(3)
      const hp = s.players.p1.hp
      s.players.p2.hand = [hit(10), hit(10)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(hp - s.players.p1.hp).toBeLessThanOrEqual(8)
      expect(s.log.some((l) => l.includes('Endurance'))).toBe(true)
      for (let i = 0; i < 3; i++) s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.perkData?.endurance).toBe(0)
    })
    it('Endurance: Charge alone gives a stack', () => {
      let s = tk('TK:1', ['A1'])
      s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
      expect(s.players.p1.perkData?.endurance).toBe(1)
    })
    it('Unflinching: an Ignite burn counts as a hit', () => {
      let s = tk('TK:1', ['A1'])
      s.players.p1.statuses.push({ kind: 'ignite', turns: 3, n: 1 })
      s.players.p2.hand = [hit(10)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(s.players.p1.perkData?.endurance).toBe(1)
    })
    it('Unrelenting: max 3+1+2, hit dmg drains over 3 turns instead of landing at once', () => {
      let s = tk('TK:1', ['A1', 'A2', 'A3'])
      expect((tuningOf(s, 'p1')['TK:1'] as Record<string, number>).ascEnduranceMax).toBe(6)
      expect((tuningOf(s, 'p2')['TK:1'] as Record<string, number>).ascEnduranceMax).toBe(3)
      const hp = s.players.p1.hp
      s.players.p2.hand = [hit(30)]
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      s.players.p2.hand = [hit(30)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      const lost1 = hp - s.players.p1.hp
      expect(lost1).toBeLessThan(30)
      for (let i = 0; i < 3; i++) s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.perkData?.drain ?? 0).toBe(0)
      expect(hp - s.players.p1.hp).toBeGreaterThan(lost1)
    })
    it('Ancient: each Charge heals 4 + 4% missing HP', () => {
      let s = tk('TK:2', ['A1', 'A2', 'A3'])
      s.players.p1.hp = 100
      s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
      expect(s.players.p1.hp).toBeGreaterThan(100)
      expect(s.log.some((l) => l.includes('Ancient'))).toBe(true)
    })
    it('Unrelenting Cost: the 2nd blocked hit still deals 50%', () => {
      let s = tk('TK:1', ['A1', 'A2', 'A3'])
      const hp = s.players.p1.hp
      s.players.p2.hand = [hit(20), hit(20)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.log.some((l) => l.includes('Unrelenting: 10 hit dmg'))).toBe(true)
      expect(s.players.p1.hp).toBeLessThanOrEqual(hp)
    })
    it('Untiring heals per stopped hit, up to its cap', () => {
      let s = tk('TK:1', ['B1', 'B2'])
      s.players.p1.hp = 200
      s.players.p2.hand = [hit(10), hit(10), hit(10), hit(10), hit(10)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.log.some((l) => l.includes('Untiring: heals 6'))).toBe(true)
    })
    it('Undeniable: S cost +50% and slot 1 ignores Block', () => {
      let s = tk('TK:1', ['C1', 'C2', 'C3'])
      expect(s.players.p1.costMod?.pct).toBe(50)
      s.players.p1.hand = [hit(10), hit(10), hit(10)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(s.players.p2.hp).toBeLessThan(250)
    })
    it('Time of Need: every 5 turns removes every debuff and heals 4 + 5% missing HP, cap −100', () => {
      let s = tk('TK:2', ['D1', 'D2', 'D3'])
      expect(tuningOf(s, 'p1')['TK:2'].maxHpCap).toBe(400)
      s.players.p1.hp = 150
      s.players.p1.statuses.push({ kind: 'noCharge', turns: 99 }, { kind: 'chill', turns: 99, n: 3 })
      for (let i = 0; i < 4; i++) s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.statuses.some((x) => x.kind === 'chill' || x.kind === 'noCharge')).toBe(true)
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.statuses.some((x) => x.kind === 'chill' || x.kind === 'noCharge')).toBe(false)
      expect(s.log.some((l) => l.includes('Time of Need'))).toBe(true)
    })
    it('Briar Wall: no growth from Blocked hits even with Bark Guard; next Strike gets +2 per stopped hit', () => {
      let s = tk('TK:2', ['B3', 'B2', 'B1'])
      expect(tuningOf(s, 'p1')['TK:2'].perHitBlocked).toBe(0)
      s.players.p2.hand = [hit(10), hit(10), hit(10)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(s.players.p1.perkData?.briar).toBe(2)
      s.players.p1.hand = [hit(1)]
      const hp = s.players.p2.hp
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(hp - s.players.p2.hp).toBeGreaterThanOrEqual(5)
    })
    it('Timber!: a 4-card Strike fells the grown Max HP into dmg, capped', () => {
      let s = tk('TK:2', ['A1', 'A2', 'C1'])
      expect(s.players.p1.styleData?.grown).toBe(20)
      s = tk('TK:2', ['C1', 'C2', 'C3'])
      s.players.p1.maxHp += 200
      s.players.p1.styleData = { ...s.players.p1.styleData, grown: 200 }
      s.players.p1.hand = [hit(1), hit(1), hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p1.styleData?.grown ?? 0).toBeLessThan(20)
      expect(s.players.p1.maxHp).toBeLessThan(300)
      expect(s.log.some((l) => l.includes('Timber!: 200 Max HP felled → every chain card +10 dmg'))).toBe(true)
    })
  })
})

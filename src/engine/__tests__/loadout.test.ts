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
    expect(validAsc(['A1', 'A2', 'A3', 'D1', 'D2'], 6, 'MG:2')).toBe(true)
    // Mage: one capstone per tree (Q 2026-10-25)
    expect(validAsc(['A1', 'A2', 'A3', 'D1', 'D2', 'D3'], 6, 'MG:2')).toBe(false)
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
      expect(tuningOf(s, 'p1')['MG:2'].frostArmorShield).toBe(10)
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
    it('Black Ice: Shatter through Block goes from half to full', () => {
      expect(tuningOf(mg('MG:2', []), 'p1')['MG:2'].shatterBlockPct).toBe(50)
      expect(tuningOf(mg('MG:2', ['A1', 'A2']), 'p1')['MG:2'].shatterBlockPct).toBe(100)
    })
    it('Rime Armor: every hit the Shield soaks gives 1 more Chill', () => {
      const s = game('MG', { asc: ['C1'], points: 6 }, 'MG:2')
      expect(tuningOf(s, 'p1')['MG:2'].frostArmorChill).toBe(2)
      s.players.p2.hand = [hit(3), hit(3)]
      s.players.p1.hand = []
      const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(n.players.p2.statuses.some((x) => x.kind === 'noStrike')).toBe(true) // 2 hits × 2 Chill = 4 → Frozen
    })
    it('Avalanche: spends half the Shield for dmg, keeps the rest, Chill after the chain', () => {
      const s = game('MG', { asc: ['C1', 'C2', 'C3'], points: 6 }, 'MG:2')
      s.players.p1.statuses = s.players.p1.statuses.filter((x) => x.kind !== 'shield')
      s.players.p1.statuses.push({ kind: 'shield', turns: 9999, n: 40 })
      s.players.p1.hand = [hit(1), hit(1)]
      const hp = s.players.p2.hp
      const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      // 20 spent: +1 dmg per 15 → +1 each, Ice Lance slot 1 +4 (Shield still up), 2 Chill (1 per 10)
      expect(hp - n.players.p2.hp).toBe(2 + 2 + 4)
      expect(n.players.p1.statuses.filter((x) => x.kind === 'shield').reduce((t, x) => t + (x.n ?? 0), 0)).toBe(20)
      expect(n.players.p2.statuses.find((x) => x.kind === 'chill')?.n).toBe(2)
    })
    it('Avalanche: enemy hits that break your Shield to 0 Freeze the attacker', () => {
      const s = game('MG', { asc: ['C1', 'C2', 'C3'], points: 6 }, 'MG:2')
      s.players.p1.statuses = s.players.p1.statuses.filter((x) => x.kind !== 'shield')
      s.players.p1.statuses.push({ kind: 'shield', turns: 9999, n: 5 })
      s.players.p1.hand = []
      s.players.p2.hand = [hit(10)]
      const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(n.players.p2.statuses.some((x) => x.kind === 'frozen')).toBe(true)
      expect(n.log.some((l) => l.includes('Avalanche: the enemy broke your Shield'))).toBe(true)
      const kept = game('MG', { asc: ['C1', 'C2', 'C3'], points: 6 }, 'MG:2') // Shield 40 soaks a 10 hit: not broken
      kept.players.p1.hand = []
      kept.players.p2.hand = [hit(10)]
      expect(resolveTurn(kept, { p1: 'charge', p2: 'strike' }).players.p2.statuses.some((x) => x.kind === 'frozen')).toBe(false)
    })
  })

  describe('Tank v3 Ascendancy', () => {
    const tk = (style: string, asc: string[]) => game('TK', { asc, points: 6 }, style, 'TK')
    const end = (s: GameState) => s.players.p1.perkData?.endurance ?? 0
    const skill = (dmg: number, costPct: number): CardInst => ({ uid: `s${uid++}`, def: { id: 'XX-S', type: 'S', dmg, effectText: '', costPct } })
    it('Unflinching: a clean hit gives 1 Endurance after the collect, cap 4', () => {
      let s = tk('TK:1', ['A1'])
      expect(tuningOf(s, 'p1')['TK:1'].endMax).toBe(4)
      expect(tuningOf(s, 'p2')['TK:1'].endMax).toBe(3)
      s.players.p1.hand = [hit(5)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(end(s)).toBe(1)
    })
    it('Whirl: a counter-spin undoes half the hit dmg that turn; Field holds 4', () => {
      let s = tk('TK:1', ['A1', 'A2', 'A3'])
      expect(s.players.p1.fieldMax).toBe(4)
      s.players.p1.perkData = { ...s.players.p1.perkData, endurance: 3 }
      s.players.p2.hand = [hit(20), hit(20)]
      const hp = s.players.p1.hp
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(s.log.some((l) => l.includes('Counter-spin guard'))).toBe(true)
      expect(hp - s.players.p1.hp).toBeLessThanOrEqual(20)
    })
    it('Thick Skull: red line 35%; losing 15% Max HP in a turn gives 1 Endurance', () => {
      let s = tk('TK:1', ['B1'])
      expect(tuningOf(s, 'p1')['TK:1'].hpPct).toBe(35)
      s.players.p2.hand = [hit(40)]
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      s.players.p1.hand = [hit(1)]
      s.players.p2.hand = [hit(40)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(end(s)).toBe(0) // Blocked: nothing lost

      s.players.p2.hand = [hit(40)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(end(s)).toBe(2) // heavy hit + Thick Skull
    })
    it('Shrug Off: the first Charge break each turn is ignored for 7% current HP and 1 Endurance', () => {
      let s = tk('TK:1', ['B1', 'B2'])
      s.players.p1.hand = [hit(1), hit(2)]
      s.players.p2.hand = [hit(1)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(s.players.p1.hand.map((c) => c.def.dmg).slice(0, 2)).toEqual([1, 2])
      expect(s.log.some((l) => l.includes('Shrug Off'))).toBe(true)
      expect(end(s)).toBe(1)
      // a lock that lands this turn (2 turns = ticks to 1 at the start) is shrugged off at the end of it
      s.players.p1.statuses.push({ kind: 'noBlock', turns: 2 })
      s = resolveTurn(s, { p1: 'charge', p2: 'block' })
      expect(legalActions(s, 'p1')).toContain('block')
    })
    it('Bloodied Cost: no Shield', () => {
      const s = tk('TK:1', ['B1', 'B2', 'B3'])
      s.players.p1.hand = [{ uid: 'sh', def: { id: 'XX-SH', type: 'P', dmg: 1, effectText: '', effectSpec: [{ hook: 'modify', do: [{ a: 'status', who: 'self', kind: 'shield', turns: 2, n: 10 }] }] } }]
      expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.statuses.some((x) => x.kind === 'shield')).toBe(false)
    })
    it('Steady: hits 2 and 3 each turn deal 3 less', () => {
      let s = tk('TK:1', ['C1'])
      s.players.p2.hand = [hit(10), hit(10), hit(10), hit(10)]
      const hp = s.players.p1.hp
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(hp - s.players.p1.hp).toBe(40 - 6)
    })
    it('Overflow: healing past Max HP becomes Shield, up to 20; Duel Cost: S +5% current HP', () => {
      let s = tk('TK:1', ['C1', 'C2'])
      s.players.p1.hand = [{ uid: 'hl', def: { id: 'XX-HL', type: 'P', dmg: 1, effectText: '', effectSpec: [{ hook: 'modify', do: [{ a: 'heal', who: 'self', n: 30 }] }] } }]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.players.p1.statuses.find((x) => x.kind === 'shield')?.n).toBe(20)
      const d = tk('TK:1', ['C1', 'C2', 'C3'])
      d.players.p1.hand = [skill(1, 10)]
      expect(resolveTurn(d, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(250 - 37) // 15% of 250
    })
    it('Momentum: the enemy loses 4 HP at the end of a turn it didn\'t Strike', () => {
      const s = tk('TK:1', ['D1'])
      expect(resolveTurn(s, { p1: 'block', p2: 'charge' }).players.p2.hp).toBe(250 - 4)
    })
    it('Spin to Win: a Block that stops 2+ hits spins, +3 per Endurance', () => {
      const s = tk('TK:1', ['D1', 'D2'])
      s.players.p1.perkData = { ...s.players.p1.perkData, endurance: 1 }
      s.players.p2.hand = [hit(5), hit(5)]
      const t = resolveTurn(s, { p1: 'block', p2: 'strike' })
      expect(t.players.p2.hp).toBe(250 - 9)
    })
    it('Culling Blade: after an S card, an enemy below 15% of your Max HP is knocked out; Cost after a collect', () => {
      let s = tk('TK:1', ['D1', 'D2', 'D3'])
      s.players.p2.hp = 36 // 15% of 250 = 37
      s.players.p1.perkData = { ...s.players.p1.perkData, endurance: 1 }
      s.players.p1.hand = [skill(0, 0)]
      s = resolveTurn(s, { p1: 'strike', p2: 'block' })
      expect(s.winner).toBe('p1')
      const c = tk('TK:1', ['D1', 'D2', 'D3'])
      c.players.p1.perkData = { ...c.players.p1.perkData, endurance: 1 }
      c.players.p1.hand = [hit(1)]
      const t = resolveTurn(c, { p1: 'strike', p2: 'charge' })
      expect(legalActions(t, 'p1')).not.toContain('block')
      expect(t.players.p1.statuses.some((x) => x.kind === 'vulnerable')).toBe(true)
    })
    it('Ancient: hold the tree only above +90; Charge heals 2% missing HP', () => {
      let s = tk('TK:2', ['A1', 'A2', 'A3'])
      expect(tuningOf(s, 'p1')['TK:2'].treeAt).toBe(90)
      s.players.p1.hp = 100
      s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
      expect(s.players.p1.hp).toBe(100 + Math.floor(((s.players.p1.maxHp - 100) * 2) / 100))
    })
    it('Carve: clean hits steal 2 Max HP each into your grown Max HP; Cost: no card heals', () => {
      const s = tk('TK:2', ['B1', 'B2', 'B3'])
      expect(tuningOf(s, 'p1')['TK:2'].cardHealPct).toBe(0)
      s.players.p1.hand = [hit(1), hit(1)]
      const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      // (the foe is a Titan Bloom too, so it grows its Max HP back from the 2 hits)
      expect(t.players.p1.perkData?.carved).toBe(4)
      expect(t.log.some((l) => l.includes('Carve: steals 4'))).toBe(true)
    })
    it('Tree Grab: hold from +40, throw costs 30 for +10 a card; Field 4 all match', () => {
      let s = tk('TK:2', ['C1', 'C2', 'C3'])
      const f = tuningOf(s, 'p1')['TK:2']
      expect([f.treeAt, f.throwCost, f.throwDmg, s.players.p1.fieldMax]).toEqual([40, 30, 10, 4])
      s.players.p1.styleData = { ...s.players.p1.styleData, grown: 50 }
      s.players.p1.maxHp += 50
      s.players.p1.hand = [hit(1), hit(1), hit(1), hit(1)]
      s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
      expect(s.log.some((l) => l.includes('Colossus Slam: every card +10'))).toBe(true)
      expect(s.players.p1.fieldMax).toBe(4)
    })
    it('Living Bark + Rooted are one node; Time of Need (T2) cleans and heals every 5 turns, no Cost', () => {
      let s = tk('TK:2', ['D1', 'D2'])
      expect(tuningOf(s, 'p1')['TK:2'].maxHpCap).toBe(500)
      expect(tuningOf(s, 'p1')['TK:2'].perDebuff).toBe(2 + 3)
      s.players.p1.hp = 150
      for (let i = 0; i < 4; i++) s = resolveTurn(s, { p1: 'block', p2: 'block' })
      s.players.p1.statuses.push({ kind: 'noCharge', turns: 3 })
      s = resolveTurn(s, { p1: 'block', p2: 'block' })
      expect(s.players.p1.statuses.some((x) => x.kind === 'noCharge')).toBe(false)
      expect(s.log.some((l) => l.includes('Time of Need'))).toBe(true)
    })
    it('Grasp of the Undying: a lethal hit leaves 1 HP, Undying 3 turns, draws 2, no heals; cap −100', () => {
      let s = tk('TK:2', ['D1', 'D2', 'D3'])
      expect(tuningOf(s, 'p1')['TK:2'].maxHpCap).toBe(400)
      s.players.p1.hp = 5
      s.players.p1.hand = []
      s.players.p2.hand = [hit(30)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(s.winner).toBeFalsy()
      expect(s.players.p1.hp).toBe(1)
      expect(s.players.p1.perkData?.undyingUntil).toBe(1 + 3)
      expect(s.log.some((l) => l.includes('Undying: draws 2'))).toBe(true)
      // can't die again while Undying, and Vigor / heals don't add HP
      s.players.p2.hand = [hit(50), hit(50)]
      s = resolveTurn(s, { p1: 'block', p2: 'strike' })
      s.players.p2.hand = [hit(50)]
      s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
      expect(s.winner).toBeFalsy()
      expect(s.players.p1.hp).toBe(1)
    })
    it('Undying: every card +10% of your Max HP, half of that when Blocked; once per match', () => {
      let s = tk('TK:2', ['D1', 'D2', 'D3'])
      s.players.p1.perkData = { ...s.players.p1.perkData, undying: 1, undyingUntil: 5 }
      const bonus = Math.floor(s.players.p1.maxHp / 10)
      s.players.p1.hand = [hit(1), hit(1)]
      const hp = s.players.p2.hp
      const t = resolveTurn(s, { p1: 'strike', p2: 'block' })
      // Block stops both cards: each still deals half the Undying dmg
      expect(t.log.some((l) => l.includes(`2 Blocked cards still deal ${bonus}`))).toBe(true)
      expect(t.players.p2.hp).toBeLessThanOrEqual(hp - bonus)
      // already used: a lethal hit after Undying ends knocks out
      let u = tk('TK:2', ['D1', 'D2', 'D3'])
      u.players.p1.perkData = { ...u.players.p1.perkData, undying: 1, undyingUntil: 0 }
      u.players.p1.hp = 5
      u.players.p2.hand = [hit(30)]
      u = resolveTurn(u, { p1: 'charge', p2: 'strike' })
      expect(u.winner).toBe('p2')
    })
  })
})

// Mage Styles: Pyromancer (MG:1) and Cryomancer (MG:2).
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn } from '../index'
import { heal } from '../state'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Mage with a Style, p2 = plain opponent
const game = (style: string): GameState =>
  createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
const shield = (s: GameState) => s.players.p1.statuses.filter((x) => x.kind === 'shield').reduce((t, x) => t + (x.n ?? 0), 0)

const skill = (dmg: number, cost = 0): CardInst => ({ uid: `s${uid++}`, def: { id: 'MG-900', type: 'S', dmg, effectText: '', cost } })
const ignite = (s: GameState, side: 'p1' | 'p2' = 'p2') => s.players[side].statuses.find((x) => x.kind === 'ignite')

describe('Pyromancer', () => {
  it('Touch of Flame: each paid Skill card that hits clean gives 1 Ignite, no extra Mana', () => {
    const s = game('MG:1')
    s.players.p1.res = 2
    s.players.p1.hand = [skill(5, 1), skill(5, 1), skill(5, 1)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(ignite(n)?.n).toBe(2) // the 3rd went unpaid
    expect(n.players.p1.res).toBe(0)
  })
  it('a blocked Skill card gives no Ignite', () => {
    const s = game('MG:1')
    s.players.p1.hand = [skill(5)]
    expect(ignite(resolveTurn(s, { p1: 'strike', p2: 'block' }))).toBeUndefined()
  })
  it('Ignite burns 2 HP + 1% Max HP per stack at the end of this turn and the next 2', () => {
    let s = game('MG:1')
    s.players.p2.maxHp = 200
    s.players.p1.hand = [skill(1)]
    const hp = s.players.p2.hp
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    for (let i = 0; i < 3; i++) s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(hp - s.players.p2.hp).toBe(1 + 12) // the hit, then 3 burns of 2 + 2
    expect(ignite(s)).toBeUndefined()
  })
  it('heals are cut 25% per stack, at most 50%', () => {
    const s = game('MG:1')
    s.players.p2.hp = 50
    s.players.p2.statuses.push({ kind: 'ignite', turns: 3, n: 1 })
    expect(heal(s, 'p2', 20)).toBe(15)
    s.players.p2.statuses[0].n = 4
    expect(heal(s, 'p2', 20)).toBe(10)
  })
  it('Molten Shield: Block spends up to 3 Mana for Shield 5 per Mana; each blocked hit Ignites the attacker', () => {
    const s = game('MG:1')
    s.players.p1.res = 4
    s.players.p2.hand = [hit(10), hit(10), hit(22)]
    const n = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(n.players.p1.hp).toBe(93) // 3rd hit 22, Shield 15 soaks 15
    expect(n.players.p1.res).toBe(2) // 4 - 3 spent, +1 for Blocking
    expect(ignite(n)?.n).toBe(2)
    expect(shield(n)).toBe(0) // this turn only
  })
  it('Molten Shield spends only the Mana there is', () => {
    const s = game('MG:1')
    s.players.p1.res = 1
    s.players.p2.hand = [hit(10), hit(10), hit(12)]
    const n = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(n.players.p1.hp).toBe(93) // Shield 5 soaks 5 of 12
    expect(n.players.p1.res).toBe(1) // 1 - 1, +1 for Blocking
  })
  it('Molten Shield with no Mana: no Shield, no Ignite', () => {
    const s = game('MG:1')
    s.players.p2.hand = [hit(10), hit(10), hit(12)]
    const n = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(ignite(n)).toBeUndefined()
    expect(n.players.p1.hp).toBe(88)
  })
})

describe('Cryomancer', () => {
  const chill = (s: GameState) => s.players.p2.statuses.find((x) => x.kind === 'chill')?.n
  const frozen = (s: GameState) => s.players.p2.statuses.some((x) => x.kind === 'noStrike')
  const fresh = () => {
    const s = game('MG:2')
    s.players.p1.statuses = [] // drop the Frost Armor Shield
    return s
  }
  it('Frost Armor: starts with Shield 40, every hit it soaks gives the attacker 1 Chill', () => {
    const s = game('MG:2')
    expect(shield(s)).toBe(40)
    s.players.p2.hand = [hit(10), hit(10), hit(30)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(n.players.p1.hp).toBe(90) // 40 soaked, 10 through
    expect(chill(n)).toBe(3)
  })
  it('Frost Barrier is gone: a Block with Mana adds no Shield and no Chill', () => {
    const s = fresh()
    s.players.p1.res = 2
    s.players.p2.hand = [hit(10), hit(10), hit(12)]
    const n = resolveTurn(s, { p1: 'block', p2: 'strike' })
    expect(n.players.p1.hp).toBe(88)
    expect(chill(n)).toBeUndefined()
    expect(n.players.p1.res).toBe(3)
  })
  it('Deep Freeze: a Strike with a Skill card spends 1 more Mana for 1 Chill', () => {
    const s = fresh()
    s.players.p1.res = 2
    s.players.p1.hand = [skill(5, 1), hit(5)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(chill(n)).toBe(1)
    expect(n.players.p1.res).toBe(0)
  })
  it('Deep Freeze needs a Skill card and the Mana', () => {
    const noSkill = fresh()
    noSkill.players.p1.res = 2
    noSkill.players.p1.hand = [hit(5)]
    expect(chill(resolveTurn(noSkill, { p1: 'strike', p2: 'block' }))).toBeUndefined()
    const noMana = fresh()
    noMana.players.p1.res = 1
    noMana.players.p1.hand = [skill(5, 1)]
    expect(chill(resolveTurn(noMana, { p1: 'strike', p2: 'block' }))).toBeUndefined()
  })
  it('Chill: each stack makes the chilled side hit 10% less', () => {
    const s = fresh()
    s.players.p2.statuses.push({ kind: 'chill', turns: 3, n: 3 })
    s.players.p2.hand = [hit(50)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(n.players.p1.hp).toBe(100 - 35) // 50 × 70%
  })
  it('4 Chill stacks freeze: Chill clears, Shatter takes 15% Max HP, no Strike next turn', () => {
    const s = game('MG:2') // Frost Armor soaks both hits: 2 more Chill
    s.players.p2.statuses.push({ kind: 'chill', turns: 3, n: 2 })
    s.players.p2.hand = [hit(10), hit(10)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(chill(n)).toBeUndefined()
    expect(n.players.p2.hp).toBe(85)
    expect(frozen(n)).toBe(true)
  })
  it('Absolute Zero: S + S + S all clean freezes and stops Block, so only Charge is left', () => {
    const s = fresh()
    s.players.p1.hand = [skill(3), skill(3), skill(3)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(legalActions(n, 'p2')).toEqual(['charge'])
  })
  it('Frozen Tomb: a hit below 30% HP brings Frost Armor back, then Block only, heal 10 + 5 per Mana, then half the Shield', () => {
    const s = fresh()
    s.players.p1.res = 2
    s.players.p2.hand = [hit(75)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(n.players.p1.hp).toBe(25)
    expect(shield(n)).toBe(40)
    expect(legalActions(n, 'p1')).toEqual(['block'])
    expect(n.players.p1.statuses.some((x) => x.kind === 'frozenTomb')).toBe(true)
    n.players.p2.hand = [hit(15)]
    const t2 = resolveTurn(n, { p1: 'block', p2: 'strike' }) // Charge gave +1 Mana (3), Block +1 more = 4
    expect(shield(t2)).toBe(40) // the hit was blocked
    expect(t2.players.p1.hp).toBe(25 + 10 + 5 * 4)
    expect(t2.players.p1.res).toBe(0)
    expect(legalActions(t2, 'p1')).toContain('strike')
    const t3 = resolveTurn(t2, { p1: 'charge', p2: 'charge' })
    expect(shield(t3)).toBe(0)
    expect(t3.players.p1.hp).toBe(55 + 20)
  })
  it('Frozen Tomb waits for the red bar: 35% HP does nothing', () => {
    const s = fresh()
    s.players.p2.hand = [hit(65)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(shield(n)).toBe(0)
    expect(legalActions(n, 'p1')).toContain('charge')
  })
  it('Frozen Tomb saves you once from a lethal hit, and the rest of that turn too', () => {
    const s = fresh()
    s.players.p2.hand = [hit(150), hit(30)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(n.winner).toBeNull()
    expect(n.players.p1.hp).toBe(1)
    expect(shield(n)).toBe(40)
  })
  it('Frozen Tomb only once a game', () => {
    const s = fresh()
    s.players.p1.styleData = { tombAt: -5 }
    s.players.p2.hand = [hit(150)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(n.winner).toBe('p2')
  })
  it('Pyromancer S + S + S only stops Block', () => {
    const s = game('MG:1')
    s.players.p1.hand = [skill(3), skill(3), skill(3)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(frozen(n)).toBe(false)
  })
})

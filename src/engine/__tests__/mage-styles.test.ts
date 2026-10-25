// Mage Styles: Pyromancer (MG:1) and Cryomancer (MG:2).
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn } from '../index'
import { heal } from '../state'
import { resolveTuning } from '../tuning'
import type { CardDef, CardInst, GameState } from '../index'
import { describeAct, describeCond } from '../effects/describe'
import { isDrawback, type CondSpec, type EffectSpec } from '../effects/spec'

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
  it('⟡ Infuse: each paid Skill card gives 1 Ignite, no extra Mana', () => {
    const s = game('MG:1')
    s.players.p1.res = 2
    s.players.p1.hand = [skill(5, 1), skill(5, 1), skill(5, 1)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(ignite(n)?.n).toBe(2) // the 3rd went unpaid
    expect(n.players.p1.res).toBe(0)
    expect(n.log.some((l) => l.includes('⟡ Infuse: 2 paid Skill cards → enemy gets 🔥 Ignite (2 stacks)'))).toBe(true)
  })
  it('⟡ Infuse: a paid Skill card that is Blocked still gives 1 Ignite', () => {
    const s = game('MG:1')
    s.players.p1.res = 1
    s.players.p1.hand = [skill(5, 1)]
    expect(ignite(resolveTurn(s, { p1: 'strike', p2: 'block' }))?.n).toBe(1)
  })
  it('⟡ Infuse: an unpaid Skill card gives no Ignite', () => {
    const s = game('MG:1')
    s.players.p1.res = 0
    s.players.p1.hand = [skill(5, 1)]
    expect(ignite(resolveTurn(s, { p1: 'strike', p2: 'charge' }))).toBeUndefined()
  })
  it('⟡ Infuse stacks per paid Skill come from the tuning (MG.infusePerS)', () => {
    const s = game('MG:1')
    s.tuning = resolveTuning({ MG: { infusePerS: 2 } })
    s.players.p1.hand = [skill(5)]
    expect(ignite(resolveTurn(s, { p1: 'strike', p2: 'block' }))?.n).toBe(2)
    const off = game('MG:1')
    off.tuning = resolveTuning({ MG: { infusePerS: 0 } })
    off.players.p1.hand = [skill(5)]
    expect(ignite(resolveTurn(off, { p1: 'strike', p2: 'charge' }))).toBeUndefined()
  })
  it('Ignite burns 2 HP + 0.5% Max HP per stack at the end of this turn and the next 2', () => {
    let s = game('MG:1')
    s.players.p2.maxHp = 200
    s.players.p1.hand = [skill(1)]
    const hp = s.players.p2.hp
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    for (let i = 0; i < 3; i++) s = resolveTurn(s, { p1: 'charge', p2: 'charge' })
    expect(hp - s.players.p2.hp).toBe(1 + 9) // the hit, then 3 burns of 2 + 1
    expect(ignite(s)).toBeUndefined()
  })
  it('heals are cut 10% per stack, at most 50%', () => {
    const s = game('MG:1')
    s.players.p2.hp = 50
    s.players.p2.statuses.push({ kind: 'ignite', turns: 3, n: 1 })
    expect(heal(s, 'p2', 20)).toBe(18)
    s.players.p2.statuses[0].n = 4
    expect(heal(s, 'p2', 20)).toBe(12)
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
  it('⟡ Infuse: a paid Skill card that is Blocked gives 1 Chill and spends no extra Mana (Deep Freeze is gone)', () => {
    const s = fresh()
    s.players.p1.res = 2
    s.players.p1.hand = [skill(5, 1), hit(5)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(chill(n)).toBe(1)
    expect(n.players.p1.res).toBe(1) // only the card's own cost
    expect(n.log.some((l) => l.includes('Deep Freeze'))).toBe(false)
  })
  it('⟡ Infuse needs a paid Skill card', () => {
    const noSkill = fresh()
    noSkill.players.p1.res = 2
    noSkill.players.p1.hand = [hit(5)]
    expect(chill(resolveTurn(noSkill, { p1: 'strike', p2: 'block' }))).toBeUndefined()
    const unpaid = fresh()
    unpaid.players.p1.res = 0
    unpaid.players.p1.hand = [skill(5, 1)]
    expect(chill(resolveTurn(unpaid, { p1: 'strike', p2: 'block' }))).toBeUndefined()
  })
  it('Chill: each stack makes the chilled side hit 10% less', () => {
    const s = fresh()
    s.players.p2.statuses.push({ kind: 'chill', turns: 3, n: 3 })
    s.players.p2.hand = [hit(50)]
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(n.players.p1.hp).toBe(100 - 35) // 50 × 70%
  })
  it('4 Chill stacks freeze: Chill clears, no Strike next turn, Flash Freeze draws, no Shatter yet', () => {
    const s = game('MG:2') // Frost Armor soaks both hits: 2 more Chill
    s.players.p2.statuses.push({ kind: 'chill', turns: 3, n: 2 })
    s.players.p2.hand = [hit(10), hit(10)]
    const field = s.players.p1.hand.length
    const n = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(chill(n)).toBeUndefined()
    expect(n.players.p2.hp).toBe(100)
    expect(frozen(n)).toBe(true)
    expect(n.players.p1.hand.length).toBe(field + 1 + 2) // Charge 1 + Flash Freeze 2
  })
  it('Shatter: the first clean hit on a Frozen enemy takes 15% Max HP, once; Block dodges it', () => {
    const frozenFoe = () => {
      const s = fresh()
      s.players.p2.statuses.push({ kind: 'chill', turns: 3, n: 3 })
      s.players.p1.hand = [skill(1)] // ⟡ Infuse: 4th Chill → Frozen
      return resolveTurn(s, { p1: 'strike', p2: 'charge' })
    }
    let s = frozenFoe()
    const hp = s.players.p2.hp
    s.players.p1.hand = [hit(1), hit(1)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(hp - s.players.p2.hp).toBe(2 + 15)
    const blocked = frozenFoe()
    blocked.players.p1.hand = [hit(1), hit(1)]
    expect(resolveTurn(blocked, { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(blocked.players.p2.hp)
  })
  it('Thaw: a side that just thawed can\'t be Frozen again yet', () => {
    const s = fresh()
    s.players.p2.statuses.push({ kind: 'thaw', turns: 2 }, { kind: 'chill', turns: 3, n: 3 })
    s.players.p1.hand = [skill(1)]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(frozen(n)).toBe(false)
  })
  it('Frost Armor regrows Shield on Block, up to its cap', () => {
    let s = fresh()
    s.players.p1.statuses = []
    for (let i = 0; i < 8; i++) s = resolveTurn(s, { p1: 'block', p2: 'charge' })
    const shields = s.players.p1.statuses.filter((x) => x.kind === 'shield')
    expect(shields.reduce((t, x) => t + (x.n ?? 0), 0)).toBe(40)
    expect(shields.length).toBe(1)
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

describe('⟡ Infuse action and new conditions (2026-10-19)', () => {
  const card = (spec: EffectSpec, type: CardInst['def']['type'] = 'P'): CardInst => ({ uid: `e${uid++}`, def: { id: 'ZZ-100', type, dmg: 1, effectText: '', effectSpec: spec } })
  const infuseP = () => card([{ hook: 'onResolve', do: [{ a: 'infuse', who: 'enemy', n: 1 }] }])
  const chillOf = (s: GameState) => s.players.p2.statuses.find((x) => x.kind === 'chill')?.n
  const plainGame = () => createGame({ championId: 'XX', hpStart: 100, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })

  it('infuse on a P card under Pyromancer gives Ignite', () => {
    const s = game('MG:1')
    s.players.p1.hand = [infuseP()]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(ignite(n)?.n).toBe(1)
    expect(chillOf(n)).toBeUndefined()
  })
  it('infuse on a P card under Cryomancer gives Chill', () => {
    const s = game('MG:2')
    s.players.p1.hand = [infuseP()]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(chillOf(n)).toBe(1)
    expect(ignite(n)).toBeUndefined()
  })
  it('infuse does nothing under a Style without one (non-Mage)', () => {
    const s = plainGame()
    s.players.p1.hand = [infuseP()]
    const n = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(ignite(n)).toBeUndefined()
    expect(chillOf(n)).toBeUndefined()
  })
  it('infuse is not a drawback, and reads as ⟡ Infuse', () => {
    expect(isDrawback({ a: 'infuse', who: 'self', n: 1 })).toBe(false)
    expect(describeAct({ a: 'infuse', who: 'enemy', n: 1 })).toBe('⟡ Infuse 1 (Pyromancer: 1 Ignite · Cryomancer: 1 Chill)')
  })

  const healIf = (c: CondSpec, type: CardInst['def']['type'] = 'P') => card([{ hook: 'onResolve', if: [c], do: [{ a: 'heal', who: 'self', n: 10 }] }], type)
  const healed = (p1: CardInst[], p2: CardInst[] = []) => {
    const s = plainGame()
    s.players.p1.hp = 50
    s.players.p1.hand = p1
    s.players.p2.hand = p2
    return resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.hp - 50
  }
  it('fieldAll: every card on that Field is the type, and the Field is not empty', () => {
    const allS: CondSpec = { c: 'fieldAll', who: 'self', type: 'S' }
    expect(healed([healIf(allS, 'S'), skill(1)])).toBe(10)
    expect(healed([healIf(allS, 'S'), hit(1)])).toBe(0)
    const foeAllP: CondSpec = { c: 'fieldAll', who: 'enemy', type: 'P' }
    expect(healed([healIf(foeAllP)], [hit(1), hit(1)])).toBe(10)
    expect(healed([healIf(foeAllP)], [])).toBe(0) // empty Field
    expect(describeCond(allS)).toBe('your Field is all Skill')
  })
  it("handCompare '<=': you don't have more cards than the opponent", () => {
    const le: CondSpec = { c: 'handCompare', op: '<=' }
    expect(healed([healIf(le), hit(1)], [hit(1), hit(1)])).toBe(10) // 2 vs 2
    expect(healed([healIf(le)], [hit(1), hit(1)])).toBe(10) // 1 vs 2
    expect(healed([healIf(le), hit(1)], [hit(1)])).toBe(0) // 2 vs 1
    expect(describeCond(le)).toBe("you don't have more cards than opponent")
  })
})

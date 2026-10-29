// Tank Styles: Lifeline (TK:1) and Titan Bloom (TK:2).
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Tank with a Style, p2 = attacker
function game(style: string, hp: number, maxHp = 100): GameState {
  return createGame({ championId: 'TK', hpStart: hp, hpMax: maxHp, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
}

const skill = (dmg: number, costPct: number, effectSpec?: CardDef['effectSpec']): CardInst => ({ uid: `s${uid++}`, def: { id: 'XX-S', type: 'S', dmg, effectText: '', costPct, effectSpec } })
const endOf = (s: GameState) => s.players.p1.perkData?.endurance ?? 0

describe('Lifeline v3: Endurance canisters', () => {
  it('a heavy hit (10%+ Max HP) and 2+ hits in a turn each give 1', () => {
    const s = game('TK:1', 100)
    s.players.p2.hand = [hit(10), hit(10)]
    const t = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect([t.players.p1.hp, endOf(t)]).toEqual([80, 2])
    const light = game('TK:1', 100)
    light.players.p2.hand = [hit(5)]
    expect(endOf(resolveTurn(light, { p1: 'charge', p2: 'strike' }))).toBe(0)
  })

  it('Strike collects all: heal 3% missing HP each, slot 1 +2 each', () => {
    const s = game('TK:1', 50)
    s.players.p1.perkData = { endurance: 2 }
    s.players.p1.hand = [hit(5), hit(5)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p1.hp).toBe(53) // 50 missing × 3% × 2
    expect(t.players.p2.hp).toBe(100 - 9 - 5)
    expect(endOf(t)).toBe(0)
  })

  it('the collect heal doubles in the red', () => {
    const s = game('TK:1', 20)
    s.players.p1.perkData = { endurance: 1 }
    s.players.p1.hand = [hit(1)]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(24) // 80 × 3% × 2
  })

  it('reaching the cap without Striking counter-spins: 6 each, through Block', () => {
    const s = game('TK:1', 100)
    s.players.p1.perkData = { endurance: 2 }
    s.players.p2.hand = [hit(1), hit(1)]
    const t = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(endOf(t)).toBe(0)
    expect(t.players.p2.hp).toBe(100 - 18)
  })

  it('paying an S card with HP gives 1 Endurance after the collect; % cost of current HP', () => {
    const s = game('TK:1', 100)
    s.players.p1.hand = [skill(10, 15, [{ hook: 'modify', do: [{ a: 'addDmg', target: 'this', n: 0.5, per: 'paidHp', max: 20 }] }])]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p1.hp).toBe(85)
    expect(t.players.p2.hp).toBe(100 - 17) // 10 + half of 15 paid
    expect(endOf(t)).toBe(1)
  })

  it('in the red an S card costs 1 Endurance instead of HP (and gives none)', () => {
    const s = game('TK:1', 20)
    s.players.p1.perkData = { endurance: 1 }
    s.players.p1.hand = [skill(10, 15)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect([t.players.p1.hp, endOf(t), t.players.p2.hp]).toEqual([20, 0, 90])
  })
})

describe('Tank v3 card tools', () => {
  it('Regen heals n% of missing HP at the end of each turn it lasts', () => {
    let s = game('TK:1', 40)
    s.players.p1.statuses.push({ kind: 'regen', turns: 3, n: 3 })
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    s = resolveTurn(s, { p1: 'block', p2: 'block' })
    // statuses tick at the start of a turn: 3 turns pushed before turn 1 = 2 heals (a card that gives it mid-turn heals 3 times)
    expect(s.players.p1.hp).toBe(40 + 1 + 1)
    expect(s.players.p1.statuses.some((x) => x.kind === 'regen')).toBe(false)
  })

  it('Empower: the next Strike gets +n on every card, once', () => {
    let s = game('TK:1', 100)
    s.players.p1.statuses.push({ kind: 'empower', turns: 9999, n: 3 })
    s.players.p1.hand = [hit(1), hit(1)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 8)
    expect(s.players.p1.statuses.some((x) => x.kind === 'empower')).toBe(false)
  })

  it('pierce with parry ignores Block and Parry; shatter removes Shield / Parry for +dmg', () => {
    const s = game('TK:1', 100)
    s.players.p2.statuses.push({ kind: 'parry', turns: 2, n: 1 })
    s.players.p1.hand = [skill(12, 0, [{ hook: 'modify', do: [{ a: 'pierce', target: 'this', parry: true }] }])]
    expect(resolveTurn(s, { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(88)
    const t = game('TK:1', 100)
    t.players.p2.statuses.push({ kind: 'parry', turns: 2, n: 1 }, { kind: 'shield', turns: 9999, n: 5 })
    t.players.p1.hand = [skill(10, 0, [{ hook: 'modify', do: [{ a: 'shatter', n: 5 }] }])]
    expect(resolveTurn(t, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(80)
  })
})

describe('Titan Bloom', () => {
  it("starts at the Tank's normal HP / Max HP, same as Lifeline", () => {
    const s = game('TK:2', 210, 300)
    expect([s.players.p1.hp, s.players.p1.maxHp]).toEqual([210, 300])
  })

  it('+2 per hit, +4 per hit blocked (Max HP only), +3 meat per facing pair (Max HP and HP)', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    // Block stops 2 (+8), 1 hit lands (+2), 2 facing pairs (+6 meat)
    const after = resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1
    expect([after.maxHp, after.hp]).toEqual([316, 210 - 1 + 6])
    const quiet = game('TK:2', 210, 300)
    expect(resolveTurn(quiet, { p1: 'charge', p2: 'charge' }).players.p1.maxHp).toBe(300)
  })

  it('caps at 500', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.maxHp = 499
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'charge', p2: 'strike' }).players.p1.maxHp).toBe(500)
  })

  it('end of turn: +2 Max HP per debuff stack on you (Q buff 2026-10-25)', () => {
    const s = game('TK:2', 210, 300)
    // 3 Ignite stacks + can't Block = 4 stacks
    s.players.p1.statuses = [{ kind: 'ignite', turns: 3, n: 3 }, { kind: 'noBlock', turns: 2 }]
    const after = resolveTurn(s, { p1: 'charge', p2: 'charge' }).players.p1
    expect(after.maxHp).toBe(308)
    expect(after.styleData?.grown).toBe(8)
    const clean = game('TK:2', 210, 300)
    clean.players.p1.statuses = [{ kind: 'shield', turns: 2, n: 10 }, { kind: 'blockPlus', turns: 1, n: 1 }]
    expect(resolveTurn(clean, { p1: 'charge', p2: 'charge' }).players.p1.maxHp).toBe(300)
  })
})

describe('Bruiser Styles', () => {
  const br = (style: string, hp: number) =>
    createGame({ championId: 'BR', hpStart: hp, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })

  it('Fury: slot 1 and 2 +10 while HP < 50%', () => {
    const s = br('BR:1', 49)
    s.players.p1.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 23)
    const ok = br('BR:1', 50)
    ok.players.p1.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(ok, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(97)
  })

  it('Fury: Warm-up +4 dmg to slots 1-2 when HP >= 50% and Rage >= 5', () => {
    const s = br('BR:1', 60)
    s.players.p1.res = 5
    s.players.p1.hand = [hit(1), hit(1), hit(1)]
    // slots 1 and 2 get +4 dmg: (1+4) + (1+4) + 1 = 11 dmg
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 11)
  })

  it('Fury: Chip damage and Rage gain on blocked hits during True Fury', () => {
    const s = br('BR:1', 40)
    s.players.p1.res = 0
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1)]
    // p2 blocks -> 2 hits blocked. Chip slots = 2 -> 2 * 5 = 10 chip dmg, +4 Rage
    const after = resolveTurn(s, { p1: 'strike', p2: 'block' })
    expect(after.players.p2.hp).toBe(90) // 10 chip damage
    expect(after.players.p1.res).toBeGreaterThanOrEqual(4) // gained chip rage
  })


  it('Juggernaut: +1 Momentum per chain card before it hits; +1 dmg per stack', () => {
    const s = br('BR:2', 90)
    s.players.p1.hand = [hit(10), hit(10)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p1.comboData?.conqueror).toBe(2)
    expect(t.players.p2.hp).toBe(100 - 24) // each hit 10 + 2 stacks
  })

  it('Juggernaut: caps at 6, then Tenacity keeps slot 1 safe from charge break for 2 turns', () => {
    const s = br('BR:2', 90)
    s.players.p1.comboData = { conqueror: 4 }
    s.players.p1.hand = [hit(1), hit(1), hit(1)]
    let t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p1.comboData?.conqueror).toBe(6)
    for (let turn = 0; turn < 2; turn++) {
      t.players.p1.hand = [hit(7), hit(8)]
      t.players.p2.hand = [hit(1)]
      t = resolveTurn(t, { p1: 'charge', p2: 'strike' })
      expect(t.players.p1.hand[0].def.dmg).toBe(7) // slot 1 kept
    }
    t.players.p1.hand = [hit(7), hit(8)]
    t.players.p2.hand = [hit(1)]
    expect(resolveTurn(t, { p1: 'charge', p2: 'strike' }).players.p1.hand.map((c) => c.def.dmg)).not.toContain(7) // Tenacity over
  })

  it('Juggernaut: Block costs 1 stack, Charge keeps them', () => {
    const s = br('BR:2', 90)
    s.players.p1.comboData = { conqueror: 2 }
    const t = resolveTurn(s, { p1: 'block', p2: 'block' })
    expect(t.players.p1.comboData?.conqueror).toBe(1)
    const c = resolveTurn(t, { p1: 'charge', p2: 'block' })
    expect(c.players.p1.comboData?.conqueror).toBe(1)
    expect(resolveTurn(c, { p1: 'block', p2: 'block' }).players.p1.comboData?.conqueror).toBe(0)
  })
})

describe('Titan Bloom dmg (Q buff 2026-10-16)', () => {
  it('every 20 Max HP grown = +1 dmg on every card you strike with', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.styleData = { grown: 45 } // +2
    s.players.p1.hand = [hit(5), hit(5)]
    const after = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(100 - after.players.p2.hp).toBe(14)
  })
  it('no bonus below 20 grown', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.styleData = { grown: 19 }
    s.players.p1.hand = [hit(5)]
    expect(100 - resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(5)
  })
  it('counts what it grew', () => {
    const s = game('TK:2', 210, 300)
    s.players.p1.hand = [hit(1), hit(1)]
    s.players.p2.hand = [hit(1), hit(1), hit(1)]
    expect(resolveTurn(s, { p1: 'block', p2: 'strike' }).players.p1.styleData?.grown).toBe(16)
  })
})

describe('Titan Bloom v3: meat and the tree', () => {
  it('each clean hit you land: +1% Max HP meat', () => {
    const s = game('TK:2', 200, 300)
    s.players.p1.hand = [hit(5), hit(5)]
    const p = resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1
    expect([p.maxHp, p.hp]).toEqual([306, 206])
  })

  it('holding the tree (> +60 grown): every card +3 and Field max 4', () => {
    const s = game('TK:2', 200, 361)
    s.players.p1.styleData = { grown: 61 } // +3 from growth, +3 tree
    s.players.p1.hand = [hit(5)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p2.hp).toBe(100 - 11)
    expect(t.players.p1.fieldMax).toBe(4)
  })

  it('a 4-card Strike while holding throws it: +6 each, −50 grown', () => {
    const s = game('TK:2', 300, 400)
    s.players.p1.styleData = { grown: 100 }
    s.players.p1.hand = [hit(1), hit(1), hit(1), hit(1)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(t.players.p2.hp).toBe(100 - 4 * 12) // 1 + 5 growth + 6 throw
    expect(t.players.p1.styleData?.grown).toBe(100 - 50 + 4 * 3) // then 4 clean hits of meat (1% of 350)
    expect(t.log.some((l) => l.includes('Colossus Slam'))).toBe(true)
  })

  it('card heals give Titan Bloom only 50%', () => {
    const heal10 = (): CardInst => ({ uid: `c${uid++}`, def: { id: 'XX-H', type: 'P', dmg: 0, effectText: '', effectSpec: [{ hook: 'modify', do: [{ a: 'heal', who: 'self', n: 10 }] }] } })
    const s = game('TK:2', 200, 300)
    s.players.p1.hand = [heal10()]
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(205)
    const l = game('TK:1', 50, 100)
    l.players.p1.hand = [heal10()]
    expect(resolveTurn(l, { p1: 'strike', p2: 'charge' }).players.p1.hp).toBe(60)
  })
})

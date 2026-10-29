// Assassin preset cards (Q 2026-10-29, migration 20261029000001): Counting Steps moves the Fatal Rhythm Critical
// counter; Afterimage, Tailwind and Final Verdict do what their text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, EffectSpec, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const sql = readFileSync(new URL('../../../supabase/migrations/20261029000001_assassin_presets_cards.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('(AS-\d{3})'[\s\S]*?'(\[\{.*\}\])'/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))
const COUNTING = specs['AS-035']
const card = (id: string, type: 'P' | 'K' | 'S', dmg: number): CardInst => ({ uid: `n${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
const steps = (dmg: number): CardInst => ({ uid: `c${uid++}`, def: { id: 'AS-035', type: 'P', dmg, effectText: '', effectSpec: COUNTING } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(mine: CardInst[], theirs: CardInst[] = [], foeHp = 100): GameState {
  const s = createGame({ championId: 'AS', hpStart: 100, hpMax: 100, deck, style: 'AS:2' }, { championId: 'XX', hpStart: foeHp, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = mine
  s.players.p2.hand = theirs
  s.players.p1.res = 0
  return s
}

describe('critCounter', () => {
  it('without it, a 3-card chain has no Critical (every 4th attack)', () => {
    const s = resolveTurn(game([hit(2), hit(2), hit(2)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 6)
    expect(s.players.p1.styleData?.attacks).toBe(3)
  })

  it('+1 before the chain moves the Critical onto the 3rd card this Strike', () => {
    const s = resolveTurn(game([steps(2), hit(2), hit(4)]), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 2 - 2 - 4 * 3)
    expect(s.players.p1.styleData?.attacks).toBe(4)
  })

  it('held while Blocking: no Strike, no count', () => {
    const s = resolveTurn(game([steps(2)]), { p1: 'block', p2: 'charge' })
    expect(s.players.p1.styleData?.attacks ?? 0).toBe(0)
  })
})

describe('new Assassin cards', () => {
  it('has JSON for AS-033..036', () => expect(Object.keys(specs).sort()).toEqual(['AS-033', 'AS-034', 'AS-035', 'AS-036']))

  it('AS-033 Afterimage ignores Block only when they Block, and draws 1', () => {
    const blocked = resolveTurn(game([card('AS-033', 'K', 8)]), { p1: 'strike', p2: 'block' })
    expect(blocked.players.p2.hp).toBe(100 - 8)
    expect(blocked.players.p1.hand).toHaveLength(1)
  })

  it('AS-034 Tailwind gives 1 Energy when you Charge', () => {
    const s = resolveTurn(game([card('AS-034', 'P', 6)]), { p1: 'charge', p2: 'block' })
    expect(s.players.p1.res).toBeGreaterThanOrEqual(1)
    const none = resolveTurn(game([card('AS-034', 'P', 6)]), { p1: 'block', p2: 'block' })
    expect((none.players.p1.res ?? 0) < (s.players.p1.res ?? 0)).toBe(true)
  })

  it('AS-036 Final Verdict: x2 and ignores Block under 30% enemy HP, plain above', () => {
    const low = game([card('AS-036', 'S', 10)], [], 29)
    low.players.p1.res = 3
    expect(resolveTurn(low, { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(29 - 20)
    const high = game([card('AS-036', 'S', 10)], [], 31)
    high.players.p1.res = 3
    expect(resolveTurn(high, { p1: 'strike', p2: 'block' }).players.p2.hp).toBe(31)
  })
})

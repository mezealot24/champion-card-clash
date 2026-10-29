// Bruiser preset cards (Q 2026-10-29, design/bruiser-deck-presets-2026-10-29.md): BR-031..034 as stored in effect_json.
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, GameState } from '../index'
import type { EffectSpec } from '../effects/spec'

let uid = 0
const card = (dmg: number, effect?: EffectSpec, type: 'P' | 'K' | 'S' = 'P'): CardInst => ({ uid: `p${uid++}`, def: { id: `PX-${uid}`, type, dmg, effectText: '', effectSpec: effect } })
const deck = Array.from({ length: 12 }, (_, i): CardDef => ({ id: `DK-${i}`, type: 'K', dmg: 1, effectText: '' }))
const game = (style?: string): GameState => {
  const s = createGame({ championId: style ? 'BR' : 'XX', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = []
  s.players.p2.hand = []
  return s
}
const strike = { a: 'strike', c: 'selfAction' } as const

const ADRENALINE: EffectSpec = [{ hook: 'onResolve', if: [strike, { c: 'hp', who: 'self', op: '<', n: 50, pct: true }], do: [{ a: 'draw', who: 'self', n: 1 }] }]
const ROLLING_THUNDER: EffectSpec = [{ hook: 'onResolve', if: [strike, { c: 'chainLength', op: '>=', n: 4 }], do: [{ a: 'draw', who: 'self', n: 1 }] }]
const IRON_STANCE: EffectSpec = [{ hook: 'onResolve', if: [{ a: 'block', c: 'selfAction' }], do: [{ a: 'status', who: 'self', kind: 'shield', turns: 1, n: 10 }, { a: 'status', who: 'self', kind: 'holdMomentum', turns: 1 }] }]
const BULLDOZER: EffectSpec = [{ hook: 'modify', if: [strike], do: [{ a: 'addDmg', target: 'this', n: 3, per: 'chainCard', max: 15 }] }]

describe('Bruiser preset cards (2026-10-29)', () => {
  it('BR-031 Adrenaline draws 1 only below 50% HP', () => {
    let s = game()
    s.players.p1.hand = [card(10, ADRENALINE)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    const high = s.players.p1.hand.length
    s.players.p1.hp = 40
    s.players.p1.hand = [card(10, ADRENALINE)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hand.length).toBe(high + 1)
  })

  it('BR-032 Rolling Thunder draws 1 with a 4+ card chain', () => {
    let s = game()
    s.players.p1.hand = [card(8, ROLLING_THUNDER, 'K'), card(1), card(1)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    const short = s.players.p1.hand.length
    s.players.p1.hand = [card(8, ROLLING_THUNDER, 'K'), card(1), card(1), card(1)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p1.hand.length).toBe(short + 1)
  })

  it('BR-033 Iron Stance: a Juggernaut Block keeps Momentum', () => {
    let s = game('BR:2')
    s.players.p1.comboData = { conqueror: 4 }
    s = resolveTurn(s, { p1: 'block', p2: 'charge' })
    expect(s.players.p1.comboData?.conqueror).toBe(3) // plain Block: −1
    s.players.p1.hand = [card(6, IRON_STANCE)]
    s = resolveTurn(s, { p1: 'block', p2: 'charge' })
    expect(s.players.p1.comboData?.conqueror).toBe(3) // held
    expect(s.players.p1.statuses.some((x) => x.kind === 'shield')).toBe(true)
    s.players.p1.hand = [] // a Block keeps the Field, so Iron Stance would fire again
    s = resolveTurn(s, { p1: 'block', p2: 'charge' })
    expect(s.players.p1.comboData?.conqueror).toBe(2) // only the turn it fires
  })

  it('BR-034 Bulldozer: +3 per chain card, max +15', () => {
    let s = game()
    s.players.p1.hand = [card(20, BULLDOZER, 'S'), card(0), card(0)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.hp).toBe(100 - 29)
  })
})

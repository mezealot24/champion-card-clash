// Q 2026-10-17: Tank heals get harder: drawn into slot N, "you've been hit by a Punch / Kick / Skill", "you Blocked a …".
import { describe, expect, it } from 'vitest'
import { createGame, resolveTurn } from '../index'
import { describeSpec } from '../effects/describe'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

let uid = 0
const card = (spec: EffectSpec, enteredWith?: number): CardInst => ({ uid: `c${uid++}`, enteredWith, def: { id: 'AA-001', type: 'P', dmg: 1, effectText: '', effectSpec: spec } })
const foe = (type: CardType, dmg = 1): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

function game(p1: CardInst[], p2: CardInst[] = []): GameState {
  const s = createGame({ championId: 'AA', hpStart: 50, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 1 })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const heal10 = [{ a: 'heal' as const, who: 'self' as const, n: 10 }]

describe('Tank heal conditions', () => {
  it('drawn into slot N reads the slot the card came in at', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'enteredAt', n: 2 }], do: heal10 }]
    expect(resolveTurn(game([card(spec, 2)]), { p1: 'block', p2: 'block' }).players.p1.hp).toBe(60)
    expect(resolveTurn(game([card(spec, 1)]), { p1: 'block', p2: 'block' }).players.p1.hp).toBe(50)
  })

  it('hit by a Kick counts only Kicks that got through', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'hitBy', n: 1, type: 'K' }], do: heal10 }]
    // Charge: both enemy hits land; one is a Kick
    expect(resolveTurn(game([card(spec)], [foe('P'), foe('K')]), { p1: 'charge', p2: 'strike' }).players.p1.hp).toBe(58)
    // Block stops both: nothing landed
    expect(resolveTurn(game([card(spec)], [foe('P'), foe('K')]), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(60 - 10)
  })

  it('Blocked a Punch counts hits your Block stopped', () => {
    const spec: EffectSpec = [{ hook: 'onResolve', if: [{ c: 'blockedType', n: 1, type: 'P' }], do: heal10 }]
    expect(resolveTurn(game([card(spec)], [foe('P')]), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(60)
    expect(resolveTurn(game([card(spec)], [foe('K')]), { p1: 'block', p2: 'strike' }).players.p1.hp).toBe(50)
  })

  it('On hit counts enemy hits only up to this slot', () => {
    const spec: EffectSpec = [{ hook: 'onHit', if: [{ c: 'hitBy', n: 1, type: 'K' }], do: heal10 }]
    // our slot 1 vs enemy P in slot 1, K in slot 2: the Kick hasn't come yet
    expect(resolveTurn(game([card(spec)], [foe('P'), foe('K')]), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(48)
    // our card in slot 2: the Kick in slot 2 counts
    expect(resolveTurn(game([foe('P'), card(spec)], [foe('P'), foe('K')]), { p1: 'strike', p2: 'strike' }).players.p1.hp).toBe(58)
  })

  it('reads as card text', () => {
    expect(describeSpec([{ hook: 'onHit', if: [{ c: 'enteredAt', n: 1 }, { c: 'hitBy', n: 2, type: 'K' }], do: heal10 }]))
      .toBe("On hit, if this card was drawn into slot 1 and you've been hit by 2+ Kicks this turn: Gain 10 HP")
  })
})

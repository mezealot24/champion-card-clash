// Pyromancer's own cards (migration 20261017000005): effect_json does what the card text says, and style_only decks.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDeck, createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261017000005_mage_pyromancer.sql', import.meta.url), 'utf8')
const rows = [...sql.matchAll(/\('(MG-\d{3})', 'MG', '([^']*)', .*?'(\[.*\])'::jsonb, (\d+), 'MG:1'\)/g)]
const specs = Object.fromEntries(rows.map((m) => [m[1], JSON.parse(m[3]) as EffectSpec]))

let uid = 0
const mg = (id: string, dmg = 4): CardInst => ({ uid: `m${uid++}`, def: { id, type: 'S', dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Mage (no Style, resources off so cards are free), p2 = 100/100
function game(p1: CardInst[], p2: CardInst[], ignite = 0): GameState {
  const s = createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 7, rules: { resources: false } })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  if (ignite) s.players.p2.statuses.push({ kind: 'ignite', turns: 3, n: ignite })
  return s
}
const stacks = (s: GameState) => s.players.p2.statuses.find((x) => x.kind === 'ignite')?.n ?? 0

it('has 7 Pyro-only cards', () => expect(rows.map((m) => m[2])).toEqual(['Blazing Catalyst', 'Infernal Conflagration', 'Wildfire Command', 'Sear Flesh', 'Heatstroke', 'Ash to Ash', 'Magma Trap']))

describe('style_only decks', () => {
  const rowsOf = [
    { id: 'MG-001', type: 'S' as const, dmg: 1, effect: '', copies: 1, style_only: '!MG:1' },
    { id: 'MG-026', type: 'S' as const, dmg: 1, effect: '', copies: 1, style_only: 'MG:1' },
    { id: 'MG-002', type: 'S' as const, dmg: 1, effect: '', copies: 1 },
  ]
  const ids = (style: string) => createGame({ championId: 'MG', hpStart: 1, hpMax: 1, deck: buildDeck(rowsOf), style }, { championId: 'XX', hpStart: 1, hpMax: 1, deck }).players.p1.deck.map((c) => c.def.id).sort()
  it('Pyromancer swaps the "!MG:1" cards for its own', () => {
    expect(ids('MG:1')).toEqual(['MG-002', 'MG-026'])
    expect(ids('MG:2')).toEqual(['MG-001', 'MG-002'])
  })
})

describe('Pyro cards', () => {
  it('Blazing Catalyst: every chain card +5 per Ignite stack', () => {
    const s = resolveTurn(game([plain(1), mg('MG-026', 1)], [], 2), { p1: 'strike', p2: 'charge' })
    expect(100 - s.players.p2.hp).toBe(22 + 2) // (1+10)+(1+10), then a 2-stack burn of 2
  })
  it('Infernal Conflagration at 3+ stacks: x1.5 and the Ignite explodes', () => {
    const s = resolveTurn(game([mg('MG-027', 16)], [], 3), { p1: 'strike', p2: 'charge' })
    expect(stacks(s)).toBe(0)
    expect(100 - s.players.p2.hp).toBe(24 + 3 * 2) // 16 × 1.5, + burn 3 × 2 turns left after this turn's tick
  })
  it('Infernal Conflagration under 3 stacks: plain hit', () => {
    const s = resolveTurn(game([mg('MG-027', 16)], [], 2), { p1: 'strike', p2: 'charge' })
    expect(stacks(s)).toBe(2)
  })
  it('Wildfire Command: Cut 2 oldest when not Ignited, the facing card when Ignited', () => {
    expect(resolveTurn(game([mg('MG-028')], [plain(), plain(), plain()]), { p1: 'strike', p2: 'charge' }).players.p2.discarded).toHaveLength(2 + 1) // + charge break
    const s = resolveTurn(game([mg('MG-028')], [plain(), plain(), plain()], 1), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.discarded!.filter((d) => d.reason === 'Cut')).toHaveLength(1)
  })
  it('Sear Flesh: no Block next turn and the Ignite timer starts again', () => {
    const g = game([mg('MG-029')], [], 1)
    g.players.p2.statuses[0].turns = 2 // ticks to 1 at the start of the turn
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.statuses.find((x) => x.kind === 'ignite')?.turns).toBe(3)
    expect(s.players.p2.statuses.some((x) => x.kind === 'noBlock')).toBe(true)
  })
  it('Ash to Ash: 1 Ignite per Skill in the chain', () => {
    expect(stacks(resolveTurn(game([mg('MG-031'), mg('MG-031'), plain()], []), { p1: 'strike', p2: 'charge' }))).toBe(4)
  })
  it('Magma Trap: opponent Charges → lose 5 and 1 Ignite', () => {
    const s = resolveTurn(game([mg('MG-032')], []), { p1: 'block', p2: 'charge' })
    expect([100 - s.players.p2.hp, stacks(s)]).toEqual([5 + 1, 1])
  })
})

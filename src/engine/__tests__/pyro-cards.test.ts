// Pyromancer's own cards (migration 20261017000005): effect_json does what the card text says, and style_only decks.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDeck, createGame, resolveTurn } from '../index'
import type { CardDef, CardInst, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261017000007_mage_pyromancer.sql', import.meta.url), 'utf8')
const all = [...sql.matchAll(/\('(MG-\d{3})', 'MG', '([^']*)', .*?, (true|false), '\{[^}]*\}', '(\[.*\])'::jsonb, (\d+|null), 'MG:1'\)/g)]
const rows = all.filter((m) => m[3] === 'true')
const specs = Object.fromEntries(rows.map((m) => [m[1], JSON.parse(m[4]) as EffectSpec]))

let uid = 0
const mg = (id: string, dmg = 4, type: 'P' | 'K' | 'S' = 'S'): CardInst => ({ uid: `m${uid++}`, def: { id, type, dmg, effectText: '', effectSpec: specs[id] } })
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

it('keeps the first Pyro set out of the deck', () => expect(all.filter((m) => m[3] === 'false').map((m) => m[1])).toEqual(['MG-033', 'MG-034', 'MG-035', 'MG-036', 'MG-037', 'MG-038', 'MG-039']))
it('has 7 Pyro-only cards in the deck', () => expect(rows.map((m) => m[2])).toEqual(['Cinder Jab', 'Blazing Kick', 'Flame Snap', 'Searing Chains', 'Heat Absorb', 'Combustion', 'Supernova']))

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
  it('Cinder Jab: clean hit → 1 Ignite, and +1 Mana if it was already burning', () => {
    const g = game([mg('MG-026', 9, 'P')], [], 1)
    g.rules.resources = true
    g.players.p1.res = 0
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(stacks(s)).toBe(2)
    expect(s.players.p1.res).toBe(1 + 1) // + clean Punch Mana
  })
  it('Blazing Kick: +3 dmg per Ignite stack', () => {
    const s = resolveTurn(game([mg('MG-027', 10, 'K')], [], 3), { p1: 'strike', p2: 'charge' })
    expect(100 - s.players.p2.hp).toBe(19 + 7) // 10 + 9, then a 3-stack burn (3·2 + 1)
  })
  it('Flame Snap: 2 Ignite before the hits, so later cards already see it', () => {
    const s = resolveTurn(game([mg('MG-028', 5), mg('MG-027', 10, 'K')], []), { p1: 'strike', p2: 'charge' })
    expect(stacks(s)).toBe(2)
    expect(100 - s.players.p2.hp).toBe(5 + 16 + 5) // Blazing Kick +6, then burn 2·2 + 1
  })
  it('Searing Chains: 1 Ignite, Silence when it reaches 2+', () => {
    expect(resolveTurn(game([mg('MG-029')], []), { p1: 'strike', p2: 'charge' }).players.p2.statuses.some((x) => x.kind === 'silence')).toBe(false)
    const s = resolveTurn(game([mg('MG-029')], [], 1), { p1: 'strike', p2: 'charge' })
    expect([stacks(s), s.players.p2.statuses.some((x) => x.kind === 'silence')]).toEqual([2, true])
  })
  it('Heat Absorb: Shield 4 per stack this turn', () => {
    const s = resolveTurn(game([mg('MG-030', 1)], [plain(12)], 3), { p1: 'strike', p2: 'strike' })
    expect(s.players.p1.hp).toBe(100) // 12 soaked by Shield 12
  })
  it('Combustion: ignores Block, +7 per stack, clears the Ignite', () => {
    const s = resolveTurn(game([plain(), plain(), mg('MG-031', 12)], [], 4), { p1: 'strike', p2: 'block' })
    expect(stacks(s)).toBe(0)
    expect(100 - s.players.p2.hp).toBe(40) // only the 2 plain cards are Blocked
  })
  it('Supernova: +2 Ignite first; at 4 stacks dmg x2 and Cut 2', () => {
    const s = resolveTurn(game([mg('MG-032', 17)], [plain(), plain(), plain()], 2), { p1: 'strike', p2: 'charge' })
    expect(s.players.p2.discarded!.filter((d) => d.reason === 'Cut')).toHaveLength(2)
    expect(100 - s.players.p2.hp).toBe(34 + 10) // x2, then burn 4·2 + 2
  })
})

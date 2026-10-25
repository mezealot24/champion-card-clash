// Cryomancer cards (migration 20261017000008): MG-044..048 do what their card text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGame, legalActions, resolveTurn } from '../index'
import type { CardDef, CardInst, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261017000008_mage_cryomancer.sql', import.meta.url), 'utf8')
const rows = [...sql.matchAll(/\('(MG-04\d)', 'MG', '[^']*', '[^']*', 'Frost', '([PKS])', (\d+), .*?'(\[.*\])'::jsonb, (\w+), 'MG:2'\)/g)]
const specs = Object.fromEntries(rows.map((m) => [m[1], JSON.parse(m[4]) as EffectSpec]))

let uid = 0
const mg = (id: string, dmg = 4): CardInst => ({ uid: `m${uid++}`, def: { id, type: 'S', dmg, effectText: '', effectSpec: specs[id] } })
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Cryomancer, p2 = plain; costs off so only the effects are tested
function game(p1: CardInst[], p2: CardInst[] = []): GameState {
  const s = createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck, style: 'MG:2' }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 3, rules: { resources: false } })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const chill = (s: GameState) => s.players.p2.statuses.find((x) => x.kind === 'chill')?.n

it('has 9 Frost cards, all Cryomancer only', () => {
  expect(rows).toHaveLength(9)
})

describe('Cryomancer cards', () => {
  it('MG-044 Ice Shatter: +30 dmg into a Frozen opponent', () => {
    const s = game([mg('MG-044', 8)])
    s.players.p2.statuses.push({ kind: 'frozen', turns: 2 }) // as freeze() leaves it
    expect(resolveTurn(s, { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(100 - 38)
    expect(resolveTurn(game([mg('MG-044', 8)]), { p1: 'strike', p2: 'charge' }).players.p2.hp).toBe(92)
  })
  it('a freeze lets Ice Shatter hit for +30 on the next turn', () => {
    let n = game([mg('MG-048')])
    n.players.p2.statuses.push({ kind: 'chill', turns: 3, n: 3 })
    n = resolveTurn(n, { p1: 'charge', p2: 'charge' }) // Totem freezes
    n.players.p1.hand = [mg('MG-044', 8)]
    const hp = n.players.p2.hp
    n = resolveTurn(n, { p1: 'strike', p2: 'charge' })
    expect(hp - n.players.p2.hp).toBe(38 + 15) // + Shatter: first clean hit on a Frozen enemy, 15% of 100
  })
  it('MG-045 Arcane Sub-Zero: next turn each clean hit gives 1 Chill', () => {
    let s = resolveTurn(game([mg('MG-045')]), { p1: 'strike', p2: 'charge' })
    s.players.p1.hand = [plain(1), plain(1)]
    s = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(chill(s)).toBe(1 + 2) // 1 from MG-045's own ⟡ Infuse (costs off = paid), then 2 clean hits
  })
  it('MG-046 Glacial Lock: opponent can\'t Charge next turn', () => {
    const s = resolveTurn(game([mg('MG-046')]), { p1: 'strike', p2: 'block' })
    expect(legalActions(s, 'p2')).not.toContain('charge')
  })
  it('MG-047 Bitter Cold: opponent\'s Skill cards have no effect next turn', () => {
    let s = resolveTurn(game([mg('MG-047')]), { p1: 'strike', p2: 'block' })
    s.players.p2.hand = [{ ...mg('MG-045'), uid: 'foe' }]
    s = resolveTurn(s, { p1: 'charge', p2: 'strike' })
    expect(s.players.p2.statuses.some((x) => x.kind === 'subZero')).toBe(false)
  })
  it('MG-048 Blizzard Totem: 1 Chill every turn it is held', () => {
    let s = resolveTurn(game([mg('MG-048')]), { p1: 'block', p2: 'charge' })
    s = resolveTurn(s, { p1: 'block', p2: 'charge' })
    expect(chill(s)).toBe(2)
  })
})

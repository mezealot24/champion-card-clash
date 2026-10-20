// Mage base deck + ⟡ Infuse (migration 20261019000001, Q 2026-10-19): 25 cards under every Style, and the new cards
// do what their card text says.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDeck, createGame, fillText, legalActions, resolveTurn, unknownPlaceholders } from '../index'
import type { CardDef, CardInst, CardRowLike, CardType, EffectSpec, GameState } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261019000001_mage_infuse_base_deck.sql', import.meta.url), 'utf8')
const str = `'((?:[^']|'')*)'`
const rowRe = new RegExp(`\\('(MG-0\\d\\d)', 'MG', ${str}, 'Q', 'Heihachi', '([PKS])', (\\d+), ${str}, (\\d+), \\d+, (true|false), '\\{[^}]*\\}', '(\\[.*?\\])'::jsonb, (\\d+|null), (null|'[^']*')\\)`, 'g')
const rows = [...sql.matchAll(rowRe)].map((m) => ({
  id: m[1],
  name: m[2].replace(/''/g, "'"),
  type: m[3] as CardType,
  dmg: Number(m[4]),
  effect: m[5].replace(/''/g, "'"),
  copies: Number(m[6]),
  in_deck: m[7] === 'true',
  effect_json: JSON.parse(m[8]) as EffectSpec,
  cost: m[9] === 'null' ? null : Number(m[9]),
  style_only: m[10] === 'null' ? null : m[10].slice(1, -1),
}))
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
const idList = (s: string) => [...s.matchAll(/'(MG-\d{3})'/g)].map((m) => m[1])
// existing cards the migration puts in the deck: "set in_deck = true, style_only = X where id in (...)"
const kept = [...sql.matchAll(/set in_deck = true, style_only = (null|'[^']*') where id in \(([^)]*)\)/g)].flatMap((m) =>
  idList(m[2]).map((id) => ({ id, style_only: m[1] === 'null' ? null : m[1].slice(1, -1) })),
)
const notIn = idList(sql.match(/set in_deck = false where champion_id = 'MG' and id not in \(([^)]*)\)/)![1])

// every existing card kept in the deck is a Skill card (9 core + 4 Pyromancer + 4 Cryomancer)
const CORE_S = ['MG-001', 'MG-002', 'MG-003', 'MG-005', 'MG-006', 'MG-013', 'MG-019', 'MG-020', 'MG-024']
const PYRO = ['MG-028', 'MG-030', 'MG-031', 'MG-032']
const CRYO = ['MG-042', 'MG-043', 'MG-044', 'MG-048']

describe('Mage base deck (migration rows)', () => {
  it('adds 16 cards, MG-049..064, all in the deck, one copy each', () => {
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 16 }, (_, i) => `MG-0${49 + i}`))
    expect(rows.every((r) => r.in_deck && r.copies === 1)).toBe(true)
    expect(rows.filter((r) => r.type === 'S').map((r) => [r.id, r.cost])).toEqual([['MG-063', 3], ['MG-064', 1]])
    expect(rows.filter((r) => r.type !== 'S').every((r) => r.cost === null)).toBe(true)
  })
  it('keeps the 9 core Skill cards for every Style and the 4 signature cards of each Style', () => {
    expect(kept.filter((k) => k.style_only === null).map((k) => k.id)).toEqual(CORE_S)
    expect(kept.filter((k) => k.style_only === 'MG:1').map((k) => k.id)).toEqual(PYRO)
    expect(kept.filter((k) => k.style_only === 'MG:2').map((k) => k.id)).toEqual(CRYO)
  })
  it('takes every other Mage card out of the deck', () => {
    expect([...notIn].sort()).toEqual([...rows.map((r) => r.id), ...kept.map((k) => k.id)].sort())
  })
  it('swaps 4 base cards out under each Style', () => {
    const out = (k: string) => rows.filter((r) => r.style_only === k).map((r) => r.name)
    expect(out('!MG:1')).toEqual(['Even Odds', 'Mana Ward', 'Blink Barrier', 'Siphon'])
    expect(out('!MG:2')).toEqual(['Pure Arcana', 'Equalize', 'Opening Salvo', 'Type Read'])
  })
  it('has no semicolon inside a string literal (the Supabase MCP splits on them)', () => {
    const literals = [...sql.replace(/^--.*$/gm, '').matchAll(/'(?:[^']|'')*'|\$t\$[\s\S]*?\$t\$/g)].map((m) => m[0])
    expect(literals.filter((s) => s.includes(';'))).toEqual([])
  })

  it('Style text: ⟡ Infuse replaces Touch of Flame / Deep Freeze, every {placeholder} names a tuning number', () => {
    const text = (slot: number) => sql.match(new RegExp(`set effect = \\$t\\$([^$]*)\\$t\\$\\s*where champion_id = 'MG' and slot = ${slot}`))![1]
    for (const slot of [1, 2]) {
      expect(unknownPlaceholders(text(slot), `MG:${slot}`)).toEqual([])
      expect(text(slot)).not.toMatch(/Touch of Flame|Deep Freeze/)
    }
    expect(fillText(text(1), 'MG:1')).toContain('⟡ Infuse: every Skill card you paid for gives the opponent 1 Ignite, even when it is Blocked')
    expect(fillText(text(2), 'MG:2')).toContain('⟡ Infuse: every Skill card you paid for gives the opponent 1 Chill, even when it is Blocked')
    expect(fillText(text(1), 'MG:1')).toContain('Molten Shield: when you Block with Mana, spend up to 3 Mana for Shield 5 per Mana this turn.')
    expect(fillText(text(2), 'MG:2')).toContain('Frozen Tomb (once a game)')
  })

  const deckRows: CardRowLike[] = [
    ...rows,
    ...kept.map((k) => ({ id: k.id, type: 'S' as const, dmg: 1, effect: '', copies: 1, in_deck: true, cost: null, style_only: k.style_only })),
  ]
  const foe = Array.from({ length: 5 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))
  const deckOf = (style?: string) =>
    createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck: buildDeck(deckRows), style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck: foe }).players.p1.deck
  const counts = (style?: string) => {
    const d = deckOf(style)
    return { total: d.length, P: d.filter((c) => c.def.type === 'P').length, K: d.filter((c) => c.def.type === 'K').length, S: d.filter((c) => c.def.type === 'S').length }
  }
  it.each([
    ['no Style', undefined, { total: 25, P: 6, K: 8, S: 11 }],
    ['Pyromancer', 'MG:1', { total: 25, P: 5, K: 5, S: 15 }],
    ['Cryomancer', 'MG:2', { total: 25, P: 4, K: 6, S: 15 }],
  ])('deck under %s: 25 cards', (_, style, want) => expect(counts(style)).toEqual(want))
  it('Pyromancer and Cryomancer decks hold their own signature cards only', () => {
    const ids = (style: string) => deckOf(style).map((c) => c.def.id)
    expect(ids('MG:1')).toEqual(expect.arrayContaining(PYRO))
    expect(ids('MG:1')).not.toEqual(expect.arrayContaining([CRYO[0]]))
    expect(ids('MG:2')).toEqual(expect.arrayContaining(CRYO))
    expect(ids('MG:2').some((id) => PYRO.includes(id))).toBe(false)
  })
  it('the Deck editor counts 25 (cards with no positive style_only)', () => {
    const n = deckRows.filter((c) => c.in_deck && !(c.style_only && !c.style_only.startsWith('!'))).reduce((t, c) => t + c.copies, 0)
    expect(n).toBe(25)
  })
})

// ---------- card behaviour ----------
let uid = 0
const mg = (id: string): CardInst => {
  const r = byId[id]
  return { uid: `m${uid++}`, def: { id, type: r.type, dmg: r.dmg, effectText: r.effect, effectSpec: r.effect_json, cost: r.cost } }
}
const plain = (dmg = 1, type: CardType = 'P'): CardInst => ({ uid: `x${uid++}`, def: { id: 'XX-000', type, dmg, effectText: '' } })
const deck = Array.from({ length: 10 }, (_, i): CardDef => ({ id: `XX-${i}`, type: 'P', dmg: 1, effectText: '' }))

// p1 = Mage (Style optional), p2 = plain 100/100. Costs off so only the effects are tested.
function game(p1: CardInst[], p2: CardInst[] = [], style?: string): GameState {
  const s = createGame({ championId: 'MG', hpStart: 100, hpMax: 100, deck, style }, { championId: 'XX', hpStart: 100, hpMax: 100, deck }, { seed: 5, rules: { resources: false } })
  s.players.p1.hand = p1
  s.players.p2.hand = p2
  return s
}
const stacks = (s: GameState, kind: 'ignite' | 'chill') => s.players.p2.statuses.find((x) => x.kind === kind)?.n ?? 0
const foeHp = (s: GameState) => s.players.p2.hp

describe('Mage base cards', () => {
  it('MG-050 Feedback Palm into a Block: opponent loses 4 HP, ⟡ Infuse 1 = 1 Ignite under Pyromancer', () => {
    const s = resolveTurn(game([mg('MG-050')], [plain()], 'MG:1'), { p1: 'strike', p2: 'block' })
    expect(stacks(s, 'ignite')).toBe(1)
    expect(stacks(s, 'chill')).toBe(0)
    expect(s.log.some((l) => l.includes('MG-050: enemy loses 4 HP'))).toBe(true)
  })
  it('MG-050 Feedback Palm under Cryomancer: ⟡ Infuse 1 = 1 Chill', () => {
    const s = resolveTurn(game([mg('MG-050')], [plain()], 'MG:2'), { p1: 'strike', p2: 'block' })
    expect(stacks(s, 'chill')).toBe(1)
    expect(stacks(s, 'ignite')).toBe(0)
    expect(foeHp(s)).toBe(96)
  })
  it('MG-050 Feedback Palm needs a Block and a facing card; no Style = no Infuse', () => {
    expect(foeHp(resolveTurn(game([mg('MG-050')], [], 'MG:2'), { p1: 'strike', p2: 'block' }))).toBe(100)
    expect(foeHp(resolveTurn(game([mg('MG-050')], [plain()], 'MG:2'), { p1: 'strike', p2: 'charge' }))).toBe(100 - 6)
    const s = resolveTurn(game([mg('MG-050')], [plain()]), { p1: 'strike', p2: 'block' })
    expect(foeHp(s)).toBe(96)
    expect(s.players.p2.statuses.some((x) => x.kind === 'ignite' || x.kind === 'chill')).toBe(false)
  })
  it('MG-061 Type Read: +13 dmg only when the opponent\'s Field is all Punch', () => {
    expect(foeHp(resolveTurn(game([mg('MG-061')], [plain(1), plain(1)]), { p1: 'strike', p2: 'charge' }))).toBe(100 - 20)
    expect(foeHp(resolveTurn(game([mg('MG-061')], [plain(1), plain(1, 'K')]), { p1: 'strike', p2: 'charge' }))).toBe(100 - 7)
    expect(foeHp(resolveTurn(game([mg('MG-061')], []), { p1: 'strike', p2: 'charge' }))).toBe(100 - 7)
  })
  it('MG-052 Equalize: your 2nd card +6 when you don\'t have more cards (equal counts too)', () => {
    expect(foeHp(resolveTurn(game([mg('MG-052'), plain(5)], [plain(), plain()]), { p1: 'strike', p2: 'charge' }))).toBe(100 - 21)
    expect(foeHp(resolveTurn(game([mg('MG-052'), plain(5)], [plain(), plain(), plain()]), { p1: 'strike', p2: 'charge' }))).toBe(100 - 21)
    expect(foeHp(resolveTurn(game([mg('MG-052'), plain(5)], [plain()]), { p1: 'strike', p2: 'charge' }))).toBe(100 - 15)
  })
  it('MG-052 Equalize held: the opponent\'s 2nd card −8', () => {
    const hit = (p1: CardInst[]) => 100 - resolveTurn(game(p1, [plain(10), plain(10)]), { p1: 'charge', p2: 'strike' }).players.p1.hp
    expect(hit([mg('MG-052')])).toBe(10 + 2)
    expect(hit([mg('MG-052'), plain(), plain()])).toBe(20)
  })
  it('MG-063 Mind Rend: the opponent discards their 2 newest Field cards', () => {
    const [a, b, c] = [plain(), plain(), plain()]
    const s = resolveTurn(game([mg('MG-063')], [a, b, c]), { p1: 'strike', p2: 'block' })
    expect(s.players.p2.hand.map((x) => x.uid)).toEqual([a.uid])
    expect(s.players.p2.deck.slice(-2).map((x) => x.uid).sort()).toEqual([b.uid, c.uid].sort())
  })
  it('MG-064 Arcane Bait comes into play: the opponent gets Shield 14 and can\'t Block next turn', () => {
    const s0 = game([])
    s0.players.p1.deck.unshift(mg('MG-064'))
    const s = resolveTurn(s0, { p1: 'charge', p2: 'charge' })
    expect(s.players.p1.hand.some((c) => c.def.id === 'MG-064')).toBe(true)
    expect(s.players.p2.statuses.find((x) => x.kind === 'shield')?.n).toBe(14)
    expect(legalActions(s, 'p2')).not.toContain('block')
    // the Shield soaks the next turn's hits
    s.players.p1.hand = [plain(10)]
    const t = resolveTurn(s, { p1: 'strike', p2: 'charge' })
    expect(foeHp(t)).toBe(100)
  })
  it('MG-062 Overchannel comes into play: draw 2 more, you can\'t Block next turn', () => {
    const drawn = (top: CardInst) => {
      const s0 = game([])
      s0.players.p1.deck.unshift(top)
      return resolveTurn(s0, { p1: 'charge', p2: 'charge' })
    }
    const base = drawn(plain()).players.p1.hand.length
    const s = drawn(mg('MG-062'))
    expect(s.players.p1.hand.length).toBe(base + 2)
    expect(legalActions(s, 'p1')).not.toContain('block')
    expect(legalActions(drawn(plain()), 'p1')).toContain('block')
  })
})

// The Bruiser JSON in migration 20261013000005 must behave exactly like the code registry.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { buildDeck, createGame, pickAiAction, resolveTurn } from '../index'
import type { CardRowLike, CardType, EffectSpec } from '../index'

const sql = readFileSync(new URL('../../../supabase/migrations/20261013000005_card_effect_json.sql', import.meta.url), 'utf8')
const specs = Object.fromEntries([...sql.matchAll(/\('(BR-\d{3})', '(\[.*\])'\)/g)].map((m) => [m[1], JSON.parse(m[2]) as EffectSpec]))

const rows: CardRowLike[] = (
  [
    ['BR-001', 'K', 16], ['BR-002', 'P', 16], ['BR-003', 'K', 14], ['BR-004', 'K', 14], ['BR-005', 'K', 10],
    ['BR-006', 'P', 10], ['BR-007', 'K', 8], ['BR-008', 'P', 8], ['BR-009', 'P', 8], ['BR-010', 'K', 8],
    ['BR-011', 'P', 7], ['BR-012', 'K', 7], ['BR-013', 'P', 4], ['BR-014', 'P', 4], ['BR-015', 'P', 3],
  ] as [string, CardType, number][]
).map(([id, type, dmg]) => ({ id, type, dmg, effect: '', copies: 1 }))

function play(withJson: boolean, seed: number) {
  const deck = buildDeck(rows.map((r) => ({ ...r, effect_json: withJson ? specs[r.id] ?? null : null })))
  const champ = { championId: 'BR', hpStart: 110, hpMax: 110, deck }
  let s = createGame(champ, champ, { seed })
  let r = seed
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647
  while (!s.winner && s.turn < 300) s = resolveTurn(s, { p1: pickAiAction(s, 'p1', rand), p2: pickAiAction(s, 'p2', rand) })
  return s.log
}

it('has JSON for all 10 Bruiser effects', () => expect(Object.keys(specs)).toHaveLength(10))

it('JSON and code play identical games', () => {
  for (let seed = 1; seed <= 30; seed++) expect(play(true, seed)).toEqual(play(false, seed))
})

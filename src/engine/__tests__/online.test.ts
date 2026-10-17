// Online match protocol: commit-reveal and replay from the seed.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { replay, revealed, sha256, type MatchDoc, type MoveDoc } from '../../online/match'
import { mirror } from '../../online/mirror'
import type { CardDef } from '../index'

const deck: CardDef[] = Array.from({ length: 10 }, (_, i) => ({ id: `XX-${i}`, type: 'P', dmg: 10, effectText: '' }))
const setupOf = () => ({ championId: 'XX', hpStart: 50, hpMax: 50, deck })
const match: MatchDoc = { code: 'ABCDE', status: 'playing', seed: 7, created: 0, p1: { uid: 'a', champ: 'XX', style: '' }, p2: { uid: 'b', champ: 'XX', style: '' } }
const mv = (t: number, side: 'p1' | 'p2', secret: string, reveal = true): MoveDoc => ({ t, side, hash: sha256(secret), ...(reveal ? { reveal: secret } : {}) })

describe('online match', () => {
  it('sha256 matches node crypto', () => {
    for (const s of ['', 'strike:abc', 'ตุ๊กตา', 'x'.repeat(200)]) expect(sha256(s)).toBe(createHash('sha256').update(s).digest('hex'))
  })
  it('a reveal that does not match its commit is ignored', () => {
    expect(revealed({ t: 0, side: 'p1', hash: sha256('block:1'), reveal: 'strike:1' })).toBeNull()
    expect(revealed(mv(0, 'p1', 'charge:9'))).toBe('charge')
  })
  it('replays revealed turns only, the same way on both clients', () => {
    const moves = Object.fromEntries(
      [mv(0, 'p1', 'charge:1'), mv(0, 'p2', 'charge:2'), mv(1, 'p1', 'strike:3'), mv(1, 'p2', 'charge:4'), mv(2, 'p1', 'block:5', false)].map((m) => [`${m.t}-${m.side}`, m]),
    )
    const a = replay(match, moves, setupOf)!
    const b = replay(match, moves, setupOf)!
    expect(a.actions).toEqual([{ p1: 'charge', p2: 'charge' }, { p1: 'strike', p2: 'charge' }])
    expect(a.states).toHaveLength(3)
    expect(JSON.stringify(a.states[2])).toBe(JSON.stringify(b.states[2]))
    expect(a.states[2].players.p2.hp).toBeLessThan(50)
  })
  it('mirror swaps the seats', () => {
    const s = replay(match, {}, setupOf)!.states[0]
    s.players.p2.hp = 1
    const m = mirror({ ...s, winner: 'p2', log: ['p1 hits p2'] })
    expect(m.players.p1.hp).toBe(1)
    expect(m.winner).toBe('p1')
    expect(m.log).toEqual(['p2 hits p1'])
  })
})

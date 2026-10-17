// Online match protocol, kept in the Artifact's shared db:
//   matches/<code>              { code, status: 'waiting' | 'playing', seed, created, p1: Seat, p2: Seat | null }
//   matches/<code>/moves/<t>-<side>   { t, side, hash, reveal? }
// Each turn a player first writes only hash = sha256("<action>:<salt>") (commit), and writes reveal = "<action>:<salt>"
// once both commits for that turn exist, so nobody can see the other's pick before locking their own.
// Both clients replay the same seed and revealed actions through the engine, so the game state is never stored.
import { createGame, legalActions, resolveTurn, type Action, type ChampionSetup, type GameState, type Side } from '../engine'

export type Seat = { uid: string; champ: string; style: string }
export type MatchDoc = { code: string; status: 'waiting' | 'playing'; seed: number; created: number; p1: Seat; p2: Seat | null }
export type MoveDoc = { t: number; side: Side; hash: string; reveal?: string }

export const moveId = (t: number, side: Side) => `${t}-${side}`

/** Replays every turn whose two picks are revealed and valid. states[i] is the game before turn i. */
export function replay(match: MatchDoc, moves: Record<string, MoveDoc>, setupOf: (s: Seat) => ChampionSetup) {
  if (!match.p2) return null
  const states: GameState[] = [createGame(setupOf(match.p1), setupOf(match.p2), { seed: match.seed })]
  const actions: Record<Side, Action>[] = []
  for (let t = 0; !states[t].winner; t++) {
    const a1 = revealed(moves[moveId(t, 'p1')])
    const a2 = revealed(moves[moveId(t, 'p2')])
    if (!a1 || !a2) break
    const g = states[t]
    if (!legalActions(g, 'p1').includes(a1) || !legalActions(g, 'p2').includes(a2)) break
    actions.push({ p1: a1, p2: a2 })
    states.push(resolveTurn(g, { p1: a1, p2: a2 }))
  }
  return { states, actions }
}

/** The action of a move whose reveal matches its commit, else null. */
export function revealed(m: MoveDoc | undefined): Action | null {
  if (!m?.reveal || sha256(m.reveal) !== m.hash) return null
  const a = m.reveal.split(':')[0] as Action
  return a === 'strike' || a === 'block' || a === 'charge' ? a : null
}

export function newSecret(a: Action): string {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${a}:${salt}`
}

export function newCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => abc[b % abc.length]).join('')
}

// --- small synchronous SHA-256 (UTF-8 in, hex out), so replays stay synchronous ---
const K = Array.from({ length: 64 }, (_, i) => {
  let n = 2
  for (let c = 0; c <= i; n++) {
    let p = true
    for (let d = 2; d * d <= n; d++) if (n % d === 0) p = false
    if (p) c++
  }
  return (Math.cbrt(n - 1) * 2 ** 32) | 0
})
export function sha256(text: string): string {
  const bytes = [...new TextEncoder().encode(text)]
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let o = 0; o < bytes.length; o += 64) {
    const w = new Array<number>(64)
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3]
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      ;[hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0]
    }
    ;[a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) | 0))
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('')
}

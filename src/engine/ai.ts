// v0 AI: weighted random by situation (see vault "AI Opponent"). Always keeps some randomness.
import { legalActions, resolveTurn } from './engine'
import type { Action, GameState, Side } from './types'
import { other } from './types'

export function pickAiAction(state: GameState, side: Side, rand: () => number = Math.random): Action {
  const me = state.players[side]
  const foe = state.players[other(side)]
  const weights: Record<Action, number> = { strike: 4, block: 3, charge: 3 }

  if (me.hand.length === 0) weights.strike = 0
  if (foe.hand.length === 0) weights.charge += 4 // foe cannot hurt us this turn
  if (foe.hand.length >= state.rules.handMax) weights.block += 3 // big chain incoming
  if (me.hand.length >= state.rules.handMax) weights.strike += 3 // full hand, Charge is wasted

  const legal = legalActions(state, side)
  const options = legal.map((a) => [a, weights[a]] as const).filter(([, w]) => w > 0)
  const total = options.reduce((t, [, w]) => t + w, 0)
  let r = rand() * total
  for (const [a, w] of options) {
    if ((r -= w) < 0) return a
  }
  return legal[0]
}

// ---------------------------------------------------------------------------------------------
// v1 AI: looks one turn ahead with the real engine. For each pair (my action, their action) it plays the turn
// out and scores the result, so Styles, Field cards, effects, resources and statuses are all "understood"
// without hand-written rules per Champion. The 3x3 payoff table is then solved as a zero-sum game (mixed
// strategy), so the AI stays unpredictable but leans towards what the Field actually favours.
// ---------------------------------------------------------------------------------------------

/** How good a position is for `side`, in "% of a life bar" units. Zero-sum: score(a) = -score(b). */
function score(state: GameState, side: Side): number {
  if (state.winner) return state.winner === side ? 1000 : state.winner === 'draw' ? 0 : -1000
  const foeSide = other(side)
  const me = state.players[side]
  const foe = state.players[foeSide]
  const hpPct = (p: typeof me) => (100 * p.hp) / Math.max(1, p.maxHp)
  // cards on the Field are loaded dmg: worth a fraction of their dmg as % of the opponent's life bar
  const handValue = (p: typeof me, victim: typeof me) => (0.35 * 100 * p.hand.reduce((t, c) => t + c.def.dmg, 0)) / Math.max(1, victim.maxHp)
  const res = (p: typeof me) => (p.res ?? 0) * 1.5
  return hpPct(me) - hpPct(foe) + handValue(me, foe) - handValue(foe, me) + res(me) - res(foe)
}

/** Solve a zero-sum matrix game for the row player by regret matching; returns the row mix. */
function solve(m: number[][], iters = 300): number[] {
  const rows = m.length
  const cols = m[0].length
  const rr = new Array(rows).fill(0)
  const rc = new Array(cols).fill(0)
  const sumR = new Array(rows).fill(0)
  const mix = (reg: number[]) => {
    const pos = reg.map((x) => Math.max(0, x))
    const t = pos.reduce((a, b) => a + b, 0)
    return t > 0 ? pos.map((x) => x / t) : reg.map(() => 1 / reg.length)
  }
  for (let k = 0; k < iters; k++) {
    const pr = mix(rr)
    const pc = mix(rc)
    for (let i = 0; i < rows; i++) sumR[i] += pr[i]
    const rowU = m.map((row) => row.reduce((t, v, j) => t + v * pc[j], 0))
    const colU = Array.from({ length: cols }, (_, j) => m.reduce((t, row, i) => t + -row[j] * pr[i], 0))
    const vr = rowU.reduce((t, u, i) => t + u * pr[i], 0)
    const vc = colU.reduce((t, u, j) => t + u * pc[j], 0)
    for (let i = 0; i < rows; i++) rr[i] += rowU[i] - vr
    for (let j = 0; j < cols; j++) rc[j] += colU[j] - vc
  }
  const t = sumR.reduce((a, b) => a + b, 0)
  return sumR.map((x) => x / t)
}

export function pickSmartAction(state: GameState, side: Side, rand: () => number = Math.random): Action {
  const foeSide = other(side)
  const mine = legalActions(state, side)
  const theirs = legalActions(state, foeSide)
  if (mine.length === 1) return mine[0]
  const table = mine.map((a) =>
    theirs.map((b) => {
      const next = resolveTurn(state, side === 'p1' ? { p1: a, p2: b } : { p1: b, p2: a })
      return score(next, side)
    }),
  )
  const mixed = solve(table)
  // a little noise so the AI never becomes a pure function of the board
  const probs = mixed.map((p) => 0.92 * p + 0.08 / mine.length)
  let r = rand()
  for (let i = 0; i < mine.length; i++) if ((r -= probs[i]) < 0) return mine[i]
  return mine[0]
}

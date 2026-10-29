// v0 AI: weighted random by situation (see vault "AI Opponent"). Always keeps some randomness.
import { legalActions, resolveTurn } from './engine'
import { COMBOS } from './combos'
import { classesOf } from './classes'
import { overdriveAdd } from './styles'
import { handMaxOf } from './state'
import type { Action, CardType, GameState, Side, StatusKind } from './types'
import { other } from './types'

export function pickAiAction(state: GameState, side: Side, rand: () => number = Math.random): Action {
  const me = state.players[side]
  const foe = state.players[other(side)]
  const weights: Record<Action, number> = { strike: 4, block: 3, charge: 3 }

  if (me.hand.length === 0) weights.strike = 0
  if (foe.hand.length === 0) weights.charge += 4 // foe cannot hurt us this turn
  if (foe.hand.length >= handMaxOf(state, other(side))) weights.block += 3 // big chain incoming
  if (me.hand.length >= handMaxOf(state, side)) weights.strike += 3 // full hand, Charge is wasted
  if (me.hand.length >= handMaxOf(state, side)) weights.charge = 0

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
//
// v2 (2026-10-16): looks 2 turns ahead (this turn, then the best mix for the reply turn), so Charging now to
// Strike a bigger chain or a combo next turn has value. The score also counts statuses (combo payoffs, Shield,
// Silence...), values Field cards closer to their real worth, and adds a small hint for how close the Field is
// to each signature combo (read from COMBOS, so it follows rule changes). A big combo hint backfires: the AI
// starts guarding its Field with Block, so it stays small and the lookahead does the real work.
// ---------------------------------------------------------------------------------------------

export type AiWeights = {
  /** Field card dmg, as a share of the same dmg actually landed */
  fieldValue: number
  /** extra multiplier on Field value while the Field is full (can't grow) */
  fullField: number
  /** % of a life bar a combo on the Field is worth when it is complete; partial combos get a share of it */
  combo: number
  /** % of a life bar per status-turn (see STATUS_VALUE) */
  status: number
  /** % of a life bar per resource point */
  res: number
  /** turns looked ahead (1 = this turn only; 2 = also the reply turn, about 9x slower) */
  depth: number
  /** share of a uniform random pick mixed into the solved mix (Arcade's easy stages raise it) */
  noise: number
}

export const AI_WEIGHTS: AiWeights = { fieldValue: 0.5, fullField: 1, combo: 5, status: 1, res: 1.5, depth: 2, noise: 0.08 }

/** Rough worth of a status to whoever has it, per remaining turn (shield is counted as HP instead). */
const STATUS_VALUE: Partial<Record<StatusKind, number>> = {
  trueDmg: 2,
  guardBreak: 3,
  blockPlus: 2,
  parry: 3,
  noBlock: -6,
  noStrike: -4,
  noCharge: -3,
  silence: -3,
  skillSilence: -2,
  vulnerable: -5,
}

/**
 * How close this Field is to each of the Champion's signature combos, 0..1 summed over combos.
 * A combo already on the Field counts 1; a missing card counts the chance of drawing its type into a free slot.
 */
export function comboPotential(state: GameState, side: Side): number {
  const p = state.players[side]
  const combos = classesOf(p).flatMap((c) => COMBOS[c] ?? [])
  if (!combos.length) return 0
  const free = handMaxOf(state, side) - p.hand.length
  const deckShare = (t: CardType) => (p.deck.length ? p.deck.filter((c) => c.def.type === t).length / p.deck.length : 0)
  let total = 0
  for (const combo of combos) {
    const missing: CardType[] = [...combo.pattern]
    for (const c of p.hand) {
      const i = missing.indexOf(c.def.type)
      if (i >= 0) missing.splice(i, 1)
    }
    if (missing.length > free) continue
    // chance each missing type shows up within the free draws (ignores overlap; it's a hint, not a proof)
    let q = 1
    for (const t of missing) q *= 1 - (1 - deckShare(t)) ** free
    total += q
  }
  return total
}

/** How good a position is for `side`, in "% of a life bar" units. Zero-sum: score(a) = -score(b). */
function score(state: GameState, side: Side, w: AiWeights): number {
  if (state.winner) return state.winner === side ? 1000 : state.winner === 'draw' ? 0 : -1000
  const half = (s: Side) => {
    const p = state.players[s]
    const victim = state.players[other(s)]
    const shield = p.statuses.reduce((t, x) => t + (x.kind === 'shield' ? (x.n ?? 0) : 0), 0)
    const hp = (100 * (p.hp + shield)) / Math.max(1, p.maxHp)
    const full = p.hand.length >= handMaxOf(state, s) ? w.fullField : 1
    // cards on the Field are loaded dmg: worth a share of their dmg as % of the opponent's life bar
    // Sonic Bliz Overdrive: the Energy bar turns into +N dmg on every card of a no-S Field of 3+
    const loaded = p.hand.reduce((t, c) => t + c.def.dmg, 0) + overdriveAdd(state, s) * p.hand.length
    const field = (w.fieldValue * full * 100 * loaded) / Math.max(1, victim.maxHp)
    const status = p.statuses.reduce((t, x) => t + (STATUS_VALUE[x.kind] ?? 0) * Math.max(1, x.turns), 0)
    const stacks = Object.values(p.comboData ?? {}).reduce((t, n) => t + n, 0)
    return hp + field + w.combo * comboPotential(state, s) + w.status * (status + 2 * stacks) + w.res * (p.res ?? 0)
  }
  return half(side) - half(other(side))
}

/** Solve a zero-sum matrix game for the row player by regret matching; returns the row mix and the game value. */
function solve(m: number[][], iters = 300): { mix: number[]; value: number } {
  const rows = m.length
  const cols = m[0].length
  const rr = new Array(rows).fill(0)
  const rc = new Array(cols).fill(0)
  const sumR = new Array(rows).fill(0)
  const sumC = new Array(cols).fill(0)
  const mix = (reg: number[]) => {
    const pos = reg.map((x) => Math.max(0, x))
    const t = pos.reduce((a, b) => a + b, 0)
    return t > 0 ? pos.map((x) => x / t) : reg.map(() => 1 / reg.length)
  }
  for (let k = 0; k < iters; k++) {
    const pr = mix(rr)
    const pc = mix(rc)
    for (let i = 0; i < rows; i++) sumR[i] += pr[i]
    for (let j = 0; j < cols; j++) sumC[j] += pc[j]
    const rowU = m.map((row) => row.reduce((t, v, j) => t + v * pc[j], 0))
    const colU = Array.from({ length: cols }, (_, j) => m.reduce((t, row, i) => t + -row[j] * pr[i], 0))
    const vr = rowU.reduce((t, u, i) => t + u * pr[i], 0)
    const vc = colU.reduce((t, u, j) => t + u * pc[j], 0)
    for (let i = 0; i < rows; i++) rr[i] += rowU[i] - vr
    for (let j = 0; j < cols; j++) rc[j] += colU[j] - vc
  }
  const row = sumR.map((x) => x / iters)
  const col = sumC.map((x) => x / iters)
  const value = m.reduce((t, r, i) => t + row[i] * r.reduce((u, v, j) => u + v * col[j], 0), 0)
  return { mix: row, value }
}

/** The AI's own choices: with a full Field it only Strikes or Blocks (Q 2026-10-17), Charge would draw nothing. */
export function aiActions(state: GameState, side: Side): Action[] {
  const legal = legalActions(state, side)
  if (state.players[side].hand.length < handMaxOf(state, side)) return legal
  const noCharge = legal.filter((a) => a !== 'charge')
  return noCharge.length ? noCharge : legal
}

/** Payoff table for `side`: every (my action, their action) pair played out, scored `depth` turns ahead. */
function payoff(state: GameState, side: Side, w: AiWeights, depth: number): { mine: Action[]; table: number[][] } {
  const mine = aiActions(state, side)
  const theirs = legalActions(state, other(side))
  const table = mine.map((a) =>
    theirs.map((b) => {
      const next = resolveTurn(state, side === 'p1' ? { p1: a, p2: b } : { p1: b, p2: a })
      if (depth <= 1 || next.winner) return score(next, side, w)
      // both sides then play the best mix for the turn after; that turn's value is this pair's worth
      return solve(payoff(next, side, w, depth - 1).table, 120).value
    }),
  )
  return { mine, table }
}

export function pickSmartAction(
  state: GameState,
  side: Side,
  rand: () => number = Math.random,
  weights: Partial<AiWeights> = {},
): Action {
  const w = { ...AI_WEIGHTS, ...weights }
  const choices = aiActions(state, side)
  if (choices.length === 1) return choices[0]
  const { mine, table } = payoff(state, side, w, w.depth)
  const mixed = solve(table).mix
  // a little noise so the AI never becomes a pure function of the board
  const probs = mixed.map((p) => (1 - w.noise) * p + w.noise / mine.length)
  let r = rand()
  for (let i = 0; i < mine.length; i++) if ((r -= probs[i]) < 0) return mine[i]
  return mine[0]
}

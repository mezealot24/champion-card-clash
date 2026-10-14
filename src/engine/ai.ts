// v0 AI: weighted random by situation (see vault "AI Opponent"). Always keeps some randomness.
import { legalActions } from './engine'
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

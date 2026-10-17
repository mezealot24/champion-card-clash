// The battle screen always shows "you" as p1. The player sitting in seat p2 gets a mirrored copy of the state.
import { other, type GameState, type Side } from '../engine'

const swapText = (l: string) => l.replace(/\bp([12])\b/g, (_, d) => (d === '1' ? 'p2' : 'p1'))

export function mirror(state: GameState): GameState {
  return {
    ...state,
    players: { p1: state.players.p2, p2: state.players.p1 },
    winner: state.winner && state.winner !== 'draw' ? other(state.winner) : state.winner,
    log: state.log.map(swapText),
    events: state.events?.map((e) => ({ ...e, side: other(e.side) })),
  }
}

export const view = (state: GameState, seat: Side) => (seat === 'p1' ? state : mirror(state))

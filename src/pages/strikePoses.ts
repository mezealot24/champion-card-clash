// Which pose each card of a Strike chain shows, so a chain like P P P P never repeats one frame:
// P walks P → P2 → P3 (a 4th+ card that ends the chain is the Pfin flurry), K walks K → K2 → K3, S swaps S ↔ S2.
// A critical hit shows the crit frame instead.
import type { CardType } from '../engine/types'
import type { Pose } from './fighters'

const CYCLE: Record<CardType, Pose[]> = { P: ['P', 'P2', 'P3'], K: ['K', 'K2', 'K3'], S: ['S', 'S2'] }

export type ChainCount = Record<CardType, number>
export const newChain = (): ChainCount => ({ P: 0, K: 0, S: 0 })

/** Pose for the card at `index` of a chain of `length` cards; bumps `count` for its type. */
export function strikePose(count: ChainCount, type: CardType, index: number, length: number, crit = false): Pose {
  const n = count[type]++
  if (crit) return 'crit'
  if (type === 'P' && index === length - 1 && index >= 3) return 'Pfin'
  const cycle = CYCLE[type]
  return cycle[n % cycle.length]
}

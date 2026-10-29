import type { DeckStats } from '../../../engine/deckStats'
import type { DeckList } from '../deck'

/**
 * A ready-made build (Q 2026-10-29): Style + Ascendancy + Oath + deck in one tap, with a 0-10 overview of
 * HP / Defend / ATK / Technique / Speed. Rubric: /mnt/project-files/design/deck-preset-stat-rubric.md.
 */
export type Preset = {
  /** unique within the Champion, e.g. 'tk-wall' */
  id: string
  name: string
  /** one line: how this build wins (English; add the Thai line to i18n/th.ts) */
  pitch: string
  /** Style key, e.g. 'TK:1' */
  style: string
  /** Oath id ('o1'..'o3') */
  oath: string
  /** Ascendancy node ids for the Style, every point spent */
  asc: string[]
  /** the cards the player picks (Style cards are added by the game): card id → copies */
  deck: DeckList
  /** hand-set overview; when left out the game computes it from the cards (engine/deckStats.ts) */
  stats?: DeckStats
}

// Bruiser deck presets. Owned by the Bruiser preset thread; rules in /mnt/project-files/design/deck-preset-stat-rubric.md.
// Design note: /mnt/project-files/design/bruiser-deck-presets-2026-10-29.md (v2 with BR-031..034, Q 2026-10-29).
// Stats are hand-set (Q: an overview of what the build leans on, like Pokémon stat bars), each within ±2 of the auto score.
import type { Preset } from './types'

export const BR_PRESETS: Preset[] = [
  {
    id: 'br-red-line',
    name: 'Red Line',
    pitch: 'Bleed yourself into Fury, then end it with huge hits and Lifesteal.',
    style: 'BR:1',
    oath: 'o1',
    asc: ['A1', 'A2', 'B1', 'D1', 'D2', 'D3'],
    deck: {
      'BR-015': 2, 'BR-030': 2, 'BR-013': 1,
      'BR-014': 2, 'BR-017': 2, 'BR-026': 2, 'BR-028': 2, 'BR-001': 2,
      'BR-016': 2, 'BR-009': 2, 'BR-031': 2, 'BR-020': 2, 'BR-029': 2,
    },
    stats: { hp: 6, def: 2, atk: 10, tech: 4, spd: 3 },
  },
  {
    id: 'br-iron-march',
    name: 'Iron March',
    pitch: 'Long chains build Momentum; Shields and Lifesteal let you trade blows.',
    style: 'BR:2',
    oath: 'o3',
    asc: ['A1', 'C1', 'C2', 'D1', 'D2', 'D3'],
    deck: {
      'BR-027': 2, 'BR-018': 2, 'BR-016': 2, 'BR-022': 2, 'BR-032': 2,
      'BR-021': 2, 'BR-024': 2, 'BR-023': 2, 'BR-008': 1, 'BR-033': 1,
      'BR-034': 1, 'BR-012': 2, 'BR-019': 2, 'BR-025': 2,
    },
    stats: { hp: 7, def: 8, atk: 6, tech: 3, spd: 3 },
  },
]

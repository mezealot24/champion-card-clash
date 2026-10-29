// Tank deck presets. Owned by the Tank preset thread; rules in /mnt/project-files/design/deck-preset-stat-rubric.md.
// Design and auto scores: /mnt/project-files/design/tank-deck-presets-2026-10-29.md. Stats are Q's hand-set overview
// (Q 2026-10-29: a Pokémon-style stat bar, not a balance number); each is within ±2 of the auto score.
// TK-024, TK-032 and TK-033 are out of the Admin deck (in_deck false) on purpose: presets may use them.
import type { Preset } from './types'

export const TK_PRESETS: Preset[] = [
  {
    id: 'tk-grove',
    name: 'Ancient Grove',
    pitch: 'Outgrow them: Block to grow Max HP, heal off it, win late with a heavy Punch chain.',
    style: 'TK:2',
    oath: 'o2',
    asc: ['A1', 'A2', 'A3', 'C1', 'D1', 'D2'],
    deck: {
      'TK-001': 2,
      'TK-002': 2,
      'TK-010': 2,
      'TK-022': 1,
      'TK-027': 1,
      'TK-007': 2,
      'TK-008': 2,
      'TK-012': 2,
      'TK-016': 2,
      'TK-024': 1,
      'TK-019': 2,
      'TK-006': 2,
      'TK-023': 2,
      'TK-032': 2,
    },
    stats: { hp: 10, def: 8, atk: 5, tech: 3, spd: 2 },
  },
  {
    id: 'tk-duel',
    name: 'Iron Duel',
    pitch: 'Guard and hit back: stack Shield and Parry, spin on big Blocks, cash in Endurance with Duel.',
    style: 'TK:1',
    oath: 'o1',
    asc: ['A1', 'C1', 'C2', 'C3', 'D1', 'D2'],
    deck: {
      'TK-007': 2,
      'TK-008': 2,
      'TK-012': 2,
      'TK-016': 2,
      'TK-024': 2,
      'TK-027': 1,
      'TK-033': 1,
      'TK-006': 2,
      'TK-019': 2,
      'TK-009': 2,
      'TK-023': 2,
      'TK-029': 1,
      'TK-030': 1,
      'TK-020': 1,
      'TK-013': 1,
      'TK-026': 1,
    },
    stats: { hp: 7, def: 10, atk: 6, tech: 4, spd: 1 },
  },
]

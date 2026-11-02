// Assassin deck presets. Owned by the Assassin preset thread; rules in /mnt/project-files/design/deck-preset-stat-rubric.md.
// Design note: /mnt/project-files/design/assassin-deck-presets-2026-10-29.md (v1.1 decks, new cards AS-033..036 in the
// DB, in_deck false). Stats left to the auto score.
import type { Preset } from './types'

export const AS_PRESETS: Preset[] = [
  {
    id: 'as-blitz',
    name: 'Blitz Tempo',
    pitch: 'Fill the Field fast, Overdrive your Punches and Kicks into Flurry, and finish with a Skill.',
    style: 'AS:1',
    oath: 'o2',
    asc: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
    // v2 (Sonic Bliz Flurry rework, Q 2026-11-02): Skills are back (5); Afterimage, Fast Hands and Rooftop Drop out
    deck: {
      'AS-006': 2, 'AS-015': 2, 'AS-025': 2, 'AS-029': 2, 'AS-034': 2,
      'AS-004': 2, 'AS-012': 2, 'AS-026': 2, 'AS-018': 2, 'AS-005': 2,
      'AS-037': 2, 'AS-032': 2, 'AS-022': 1,
    },
  },
  {
    id: 'as-rhythm',
    name: 'Death Rhythm',
    pitch: 'Count to the Critical, land it on a big Skill, and finish them under the line.',
    style: 'AS:2',
    oath: 'o1',
    asc: ['A1', 'A2', 'A3', 'D1', 'D2', 'D3'],
    deck: {
      'AS-019': 2, 'AS-017': 2, 'AS-028': 2, 'AS-032': 2, 'AS-023': 1, 'AS-022': 1, 'AS-036': 1,
      'AS-009': 2, 'AS-029': 2, 'AS-025': 2, 'AS-027': 1, 'AS-035': 2,
      'AS-026': 2, 'AS-010': 2, 'AS-018': 1,
    },
  },
]

// Mage (Pyromancer + Cryomancer) deck presets. Owned by the Mage (Pyromancer + Cryomancer) preset thread; rules in /mnt/project-files/design/deck-preset-stat-rubric.md.
// Design note: /mnt/project-files/design/mage-deck-presets-2026-10-29.md (Q picked Option B: new cards MG-065..068).
import type { Preset } from './types'

export const MG_PRESETS: Preset[] = [
  {
    id: 'mg-wildfire',
    name: 'Wildfire Burst',
    pitch: 'Pile on Ignite with every Skill, then Silence them and drop the Meteor.',
    style: 'MG:1',
    oath: 'o1',
    asc: ['A1', 'A2', 'A3', 'B1', 'B2', 'D1'],
    deck: {
      'MG-001': 2, // Mana Surge
      'MG-013': 2, // Tempest
      'MG-003': 2, // Meteor Strike
      'MG-063': 1, // Mind Rend
      'MG-066': 1, // Flash Fire
      'MG-050': 2, // Feedback Palm
      'MG-065': 2, // Kindling
      'MG-015': 1, // Leyline Tap
      'MG-062': 2, // Overchannel
      'MG-060': 2, // Ward Reader
    },
  },
  {
    id: 'mg-glacier',
    name: 'Glacier Lock',
    pitch: 'Hide behind ice, lock what they can do, and win the long game.',
    style: 'MG:2',
    oath: 'o2',
    asc: ['B1', 'B2', 'C1', 'C2', 'D1', 'D2'],
    deck: {
      'MG-004': 2, // Frostbite
      'MG-005': 1, // Mind Boggle
      'MG-013': 1, // Tempest
      'MG-003': 1, // Meteor Strike
      'MG-019': 1, // Shatter
      'MG-020': 2, // Arcane Missile
      'MG-010': 2, // Runic Deflect
      'MG-067': 1, // Frozen Lance
      'MG-068': 1, // Rime Ward
      'MG-060': 2, // Ward Reader
      'MG-053': 1, // Last Light
      'MG-050': 1, // Feedback Palm
      'MG-014': 1, // Insight
    },
  },
]

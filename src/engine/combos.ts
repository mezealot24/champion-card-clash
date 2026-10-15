// Signature combos: one per Champion (champions.signature_combo), keyed by champion id.
// A combo = 3 cards in a row in your Strike chain with the right P/K/S types; it fires once per chain.
// Kept free of state.ts imports (like styles.ts).
import type { CardType, GameState, Side } from './types'

/** One slot of the finished chain. */
export type ComboHit = { type: CardType; blocked: boolean; clean: boolean }

export type ComboDef = {
  name: string
  pattern: [CardType, CardType, CardType]
  /** Do the 3 matched hits qualify? (e.g. all clean) */
  ok: (hits: ComboHit[]) => boolean
  fire: (state: GameState, side: Side) => void
}

const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const foe = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')
const allClean = (h: ComboHit[]) => h.every((x) => x.clean)

export const COMBOS: Record<string, ComboDef> = {
  /** Tank · S > S > S: if the opponent Blocks one of them, heal 10% of your current HP. */
  TK: {
    name: 'S > S > S',
    pattern: ['S', 'S', 'S'],
    ok: (h) => h.some((x) => x.blocked),
    fire: (state, side) => {
      const p = state.players[side]
      const n = Math.floor(p.hp / 10)
      p.hp = Math.min(p.maxHp, p.hp + n)
      say(state, side, `Combo S > S > S: ฮีล ${n} (10% ของ HP ที่เหลือ)`)
    },
  },
  /** Assassin · P > K > S, all clean: True Damage for the next 3 turns. */
  AS: {
    name: 'P > K > S',
    pattern: ['P', 'K', 'S'],
    ok: allClean,
    fire: (state, side) => {
      const p = state.players[side]
      p.statuses = [...p.statuses.filter((s) => s.kind !== 'trueDmg'), { kind: 'trueDmg', turns: 3 }]
      say(state, side, 'Combo P > K > S: True Damage 3 เทิร์นถัดไป')
    },
  },
  /** Mage · S + S + S, all clean: the opponent can't Block next turn. */
  MG: {
    name: 'S + S + S',
    pattern: ['S', 'S', 'S'],
    ok: allClean,
    fire: (state, side) => {
      state.players[foe(side)].statuses.push({ kind: 'noBlock', turns: 1 })
      say(state, side, 'Combo S + S + S: ศัตรู Block ไม่ได้เทิร์นหน้า')
    },
  },
}

/** Fire this side's combo if its chain has the pattern (first match only). */
export function checkCombo(state: GameState, side: Side, hits: ComboHit[]) {
  const combo = COMBOS[state.players[side].championId]
  if (!combo) return
  for (let i = 0; i + 3 <= hits.length; i++) {
    const three = hits.slice(i, i + 3)
    if (three.every((h, j) => h.type === combo.pattern[j]) && combo.ok(three)) {
      combo.fire(state, side)
      return
    }
  }
}

// Signature combos, keyed by champion id (champions.signature_combo). A Champion can have more than one.
// A combo = 3 cards in a row in your Strike chain with the right P/K/S types; each combo fires once per chain.
// Kept free of state.ts imports (like styles.ts).
import type { Action, CardType, GameState, Side } from './types'

/** One slot of the chain. Before hits, blocked/clean are both false. */
export type ComboHit = { type: CardType; blocked: boolean; clean: boolean }

export type ComboDef = {
  name: string
  pattern: [CardType, CardType, CardType]
  /** 'before' = checked on card types right after actions are revealed; 'after' (default) = after the chain hit */
  when?: 'before' | 'after'
  /** Do the 3 matched hits qualify? (e.g. all clean). Default: yes. */
  ok?: (hits: ComboHit[]) => boolean
  fire: (state: GameState, side: Side) => void
}

const say = (state: GameState, side: Side, line: string) => state.log.push(`T${state.turn} ${side} ${line}`)
const foe = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')
const allClean = (h: ComboHit[]) => h.every((x) => x.clean)

export const CONQUEROR_MAX = 6

export const COMBOS: Record<string, ComboDef[]> = {
  /** Tank · S > S > S: if the opponent Blocks one of them, heal 10% of your current HP. */
  TK: [
    {
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
  ],
  /** Assassin · P > K > S, all clean: True Damage for the next 3 turns. */
  AS: [
    {
      name: 'P > K > S',
      pattern: ['P', 'K', 'S'],
      ok: allClean,
      fire: (state, side) => {
        const p = state.players[side]
        p.statuses = [...p.statuses.filter((s) => s.kind !== 'trueDmg'), { kind: 'trueDmg', turns: 3 }]
        say(state, side, 'Combo P > K > S: True Damage 3 เทิร์นถัดไป')
      },
    },
  ],
  /** Mage · S + S + S, all clean: the opponent can't Block next turn. */
  MG: [
    {
      name: 'S + S + S',
      pattern: ['S', 'S', 'S'],
      ok: allClean,
      fire: (state, side) => {
        state.players[foe(side)].statuses.push({ kind: 'noBlock', turns: 1 })
        say(state, side, 'Combo S + S + S: ศัตรู Block ไม่ได้เทิร์นหน้า')
      },
    },
  ],
  BR: [
    /**
     * Bruiser · S > P > P: Guard Break for up to 3 turns, used up by your next Strike.
     * Guard Break: hits stopped by Block still deal half dmg (rounded down).
     */
    {
      name: 'S > P > P',
      pattern: ['S', 'P', 'P'],
      fire: (state, side) => {
        const p = state.players[side]
        p.statuses = [...p.statuses.filter((s) => s.kind !== 'guardBreak'), { kind: 'guardBreak', turns: 3 }]
        say(state, side, 'Combo S > P > P: Guard Break (ใช้กับ Strike ครั้งถัดไป ภายใน 3 เทิร์น)')
      },
    },
    /**
     * Bruiser · S > K > K (Before action): Conqueror +1 stack, max 6. Each stack = +1 dmg on every card
     * you attack with for the rest of the game. At 6 stacks: Omnivamp (heal 10% of each hit's dmg),
     * but a charge break makes the opponent's hits deal 30% more.
     */
    {
      name: 'S > K > K',
      pattern: ['S', 'K', 'K'],
      when: 'before',
      fire: (state, side) => {
        const p = state.players[side]
        const n = Math.min(CONQUEROR_MAX, (p.comboData?.conqueror ?? 0) + 1)
        p.comboData = { ...p.comboData, conqueror: n }
        say(state, side, `Combo S > K > K: Conqueror ${n}/${CONQUEROR_MAX}${n === CONQUEROR_MAX ? ' (Omnivamp)' : ''}`)
      },
    },
  ],
}

/** Fire this side's combos for one timing if its chain has the pattern (first match only, once each). */
export function checkCombos(state: GameState, side: Side, hits: ComboHit[], when: 'before' | 'after') {
  for (const combo of COMBOS[state.players[side].championId] ?? []) {
    if ((combo.when ?? 'after') !== when) continue
    for (let i = 0; i + 3 <= hits.length; i++) {
      const three = hits.slice(i, i + 3)
      if (three.every((h, j) => h.type === combo.pattern[j]) && (combo.ok ?? (() => true))(three)) {
        combo.fire(state, side)
        break
      }
    }
  }
}

export const conquerorOf = (state: GameState, side: Side) => state.players[side].comboData?.conqueror ?? 0

/**
 * Conqueror after Before action combos: +stack dmg on every slot of this side's chain;
 * at max stack, a charge break makes the opponent's hits deal 30% more.
 */
export function applyConqueror(
  state: GameState,
  side: Side,
  actions: Record<Side, Action>,
  bonus: number[] | undefined,
  enemyMult: number[] | undefined,
) {
  const n = conquerorOf(state, side)
  if (!n) return
  if (bonus) for (let i = 0; i < bonus.length; i++) bonus[i] += n
  if (n >= CONQUEROR_MAX && actions[side] === 'charge' && enemyMult) {
    for (let i = 0; i < enemyMult.length; i++) enemyMult[i] *= 1.3
    say(state, side, 'Conqueror: โดน charge break รับ dmg เพิ่ม 30%')
  }
}

/** Omnivamp: % of each hit's dmg healed back (0 when not at max Conqueror). */
export const lifestealPct = (state: GameState, side: Side) => (conquerorOf(state, side) >= CONQUEROR_MAX ? 10 : 0)

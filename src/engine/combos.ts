// Signature combos, keyed by champion id (champions.signature_combo). A Champion can have more than one.
// A combo = 3 cards in your Strike chain with the right P/K/S types, in any order and any position (Q 2026-10-16);
// each combo fires once per chain.
// Kept free of state.ts imports (like styles.ts).
import type { Action, CardType, GameState, Side } from './types'
import { tuningOf } from './tuning'

/** Freeze a side: Chill clears and it can't Strike next turn. `frozen` outlasts noStrike by a turn so cards can read it that turn. */
export function freeze(state: GameState, side: Side, why: string) {
  const p = state.players[side]
  p.statuses = p.statuses.filter((s) => s.kind !== 'chill' && s.kind !== 'frozen')
  if (!p.statuses.some((s) => s.kind === 'noStrike')) p.statuses.push({ kind: 'noStrike', turns: 1 })
  p.statuses.push({ kind: 'frozen', turns: 2 })
  state.log.push(`T${state.turn} ${side} 🧊 Frozen: ${why} → can't Strike next turn`)
}

/** One slot of the chain. Before hits, blocked/clean are both false. */
export type ComboHit = { type: CardType; blocked: boolean; clean: boolean }

export type ComboDef = {
  name: string
  /** The 3 card types needed; order doesn't matter. */
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

/** Mark of Assassin lasts the rest of the game (statuses count down, so: a number no game reaches). Burst % = tuning AS.markBurstPct */
export const DEATH_MARK_TURNS = 9999

export const COMBOS: Record<string, ComboDef[]> = {
  /** Tank · P > K > P (two P + one K, any order; Q 2026-10-16): if the opponent Blocks one of them, heal comboHealPct (10%) of your current HP. */
  TK: [
    {
      name: 'P > K > P',
      pattern: ['P', 'K', 'P'],
      ok: (h) => h.some((x) => x.blocked),
      fire: (state, side) => {
        const p = state.players[side]
        const pct = tuningOf(state, side).TK.comboHealPct
        const n = Math.floor((p.hp * pct) / 100)
        if (p.hp <= 0 || n <= 0) return // a side at 0 HP stays down
        const before = p.hp
        p.hp = Math.min(p.maxHp, p.hp + n)
        if (p.hp !== before) (state.events ??= []).push({ k: 'hp', side, delta: p.hp - before })
        say(state, side, `Combo P > K > P: heal ${n} (${pct}% of current HP)`)
      },
    },
  ],
  /**
   * Assassin · P > K > S, all clean: Mark of Assassin on the opponent for the rest of the game (Q 2026-10-16, replaced True Damage).
   * Every later Strike against a marked opponent bursts for 50% of that chain's total dmg (engine.ts). Doesn't stack.
   */
  AS: [
    {
      name: 'P > K > S',
      pattern: ['P', 'K', 'S'],
      ok: allClean,
      fire: (state, side) => {
        const enemy = state.players[foe(side)]
        if (enemy.statuses.some((s) => s.kind === 'deathMark')) return
        enemy.statuses.push({ kind: 'deathMark', turns: DEATH_MARK_TURNS })
        say(state, side, 'Combo P > K > S: 💀 Mark of Assassin on the enemy for the rest of the game')
      },
    },
  ],
  /**
   * Mage · S + S + S, all clean: the opponent can't Block next turn.
   * Under Cryomancer it is Absolute Zero (Q 2026-10-18): the opponent is also Frozen, whatever its Chill,
   * so it can't Strike or Block next turn and is left with Charge.
   */
  MG: [
    {
      name: 'S + S + S',
      pattern: ['S', 'S', 'S'],
      ok: allClean,
      fire: (state, side) => {
        const turns = tuningOf(state, side).MG.comboNoBlockTurns
        if (turns > 0) state.players[foe(side)].statuses.push({ kind: 'noBlock', turns })
        if (state.players[side].style === 'MG:2') {
          say(state, side, 'Combo Absolute Zero: enemy can\'t Block next turn')
          freeze(state, foe(side), 'Absolute Zero')
        } else say(state, side, 'Combo S + S + S: enemy can\'t Block next turn')
      },
    },
  ],
  BR: [
    /**
     * Bruiser · S > P > P: Guard Crush for up to 3 turns, used up by your next Strike.
     * Guard Crush: hits stopped by Block still deal half dmg (rounded down), and if the opponent
     * Blocked that Strike they lose their 2 oldest Field cards (Q 2026-10-15).
     */
    {
      name: 'S > P > P',
      pattern: ['S', 'P', 'P'],
      fire: (state, side) => {
        const p = state.players[side]
        const turns = tuningOf(state, side).BR.guardCrushTurns
        p.statuses = [...p.statuses.filter((s) => s.kind !== 'guardBreak'), { kind: 'guardBreak', turns }]
        say(state, side, `Combo S > P > P: Guard Crush (for your next Strike within ${turns} turns)`)
      },
    },
  ],
}

/** Does a trio of hits hold exactly the card types of the pattern (any order)? */
const sameTypes = (three: ComboHit[], pattern: CardType[]) => {
  const left = [...pattern]
  for (const h of three) {
    const i = left.indexOf(h.type)
    if (i < 0) return false
    left.splice(i, 1)
  }
  return true
}

/** Fire this side's combos for one timing if any 3 cards of its chain match the pattern (once each). */
export function checkCombos(state: GameState, side: Side, hits: ComboHit[], when: 'before' | 'after') {
  const ok = (c: ComboDef, three: ComboHit[]) => (c.ok ?? (() => true))(three)
  for (const combo of COMBOS[state.players[side].championId] ?? []) {
    if ((combo.when ?? 'after') !== when) continue
    let found = false
    for (let i = 0; i < hits.length && !found; i++)
      for (let j = i + 1; j < hits.length && !found; j++)
        for (let k = j + 1; k < hits.length && !found; k++) {
          const three = [hits[i], hits[j], hits[k]]
          if (sameTypes(three, combo.pattern) && ok(combo, three)) found = true
        }
    if (found) {
      combo.fire(state, side)
      ;(state.events ??= []).push({ k: 'combo', side, name: combo.name })
    }
  }
}

export const conquerorOf = (state: GameState, side: Side) => state.players[side].comboData?.conqueror ?? 0

/**
 * Momentum stacks (Bruiser · Juggernaut Style, styles.ts; was the S > K > K combo until Q 2026-10-16):
 * +stack dmg on every slot of this side's chain;
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
  const f = tuningOf(state, side)['BR:2']
  if (bonus) for (let i = 0; i < bonus.length; i++) bonus[i] += n * f.dmgPerStack
  if (n >= f.conquerorMax && actions[side] === 'charge' && enemyMult && f.chargeBreakTakenPct) {
    for (let i = 0; i < enemyMult.length; i++) enemyMult[i] *= 1 + f.chargeBreakTakenPct / 100
    say(state, side, `Momentum: charge break hit, takes +${f.chargeBreakTakenPct}% dmg`)
  }
}

/** Lifesteal: % of each hit's dmg healed back (0 when not at max Momentum). */
export const lifestealPct = (state: GameState, side: Side) => {
  const f = tuningOf(state, side)['BR:2']
  return conquerorOf(state, side) >= f.conquerorMax ? f.omnivampPct : 0
}

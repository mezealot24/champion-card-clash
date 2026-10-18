// Pure game types: no React, no Supabase. The engine only reads these.
import type { EffectSpec } from './effects/spec'

export type CardType = 'P' | 'K' | 'S'
export type Action = 'strike' | 'block' | 'charge'
export type Side = 'p1' | 'p2'

/** One card design (one DB row). Copies share the same def. */
export type CardDef = {
  id: string // CLASS-NNN, e.g. BR-001
  type: CardType
  dmg: number
  effectText: string // display only
  effectSpec?: EffectSpec | null // cards.effect_json; wins over code in effects/registry.ts
  /** Resource cost paid when it fires in a Strike chain (engine/resources.ts). Null on an S card = class default. */
  cost?: number | null
  /** cards.style_only: "MG:1" = only under that Style, "!MG:1" = under every Style but that one, null = always (see inStyleDeck). */
  styleOnly?: string | null
}

/** One physical card in a game. uid is unique even for copies. */
/**
 * grow = dmg this copy has gained for the rest of the game; growNext = dmg it adds to its next attack only.
 * Both stay on the copy when it goes back to the deck.
 * usedOnce = indexes of this card's "once per game" rules that already fired.
 * enteredWith = cards on the Field (this one included) when this copy last came into play.
 */
/** owner = the side whose deck this copy goes back to, when it was stolen onto the other Field. */
export type CardInst = { uid: string; def: CardDef; grow?: number; growNext?: number; usedOnce?: number[]; enteredWith?: number; owner?: Side }

/** trueDmg = your hits ignore dmg cuts (only Block stops them) */
/** deathMark = on the side that carries it: every Strike against it bursts for 50% of that chain's total dmg (Assassin combo, rest of game) */
/** guardBreak = Guard Crush: on your next Strike, blocked hits deal half and a Blocking opponent loses their 2 oldest Field cards */
/**
 * silence = your cards' effects don't fire this turn (Styles and combos still work)
 * shield = absorbs n dmg from hits before HP; lasts until used up or its turns run out
 * parry = the next n hits that get past your Block are deflected and deal 0, nothing goes back (this turn; Q 2026-10-17: a Block is 2 Parries)
 */
/** ignite = burning (Pyromancer, Q 2026-10-17): n = stacks; see IGNITE_* in styles.ts. chill = Cryomancer's slow (n = stacks, CHILL_*).
 * frozen = marker for "can't Strike this turn" (lasts 1 turn longer than its noStrike so cards can read it). skillSilence = Skill cards' effects off (Bitter Cold). subZero = next Strike: every clean hit gives 1 Chill (Arcane Sub-Zero) */
export type StatusKind = 'noStrike' | 'noBlock' | 'noCharge' | 'blockPlus' | 'trueDmg' | 'guardBreak' | 'silence' | 'shield' | 'parry' | 'vulnerable' | 'deathMark' | 'ignite' | 'chill' | 'frozen' | 'skillSilence' | 'subZero'
/** n = size: blockPlus (Block stops n more hits; negative = fewer), shield (points left), parry (hits left) */
export type Status = { kind: StatusKind; turns: number; n?: number }

export type PlayerState = {
  championId: string
  hp: number
  maxHp: number
  hand: CardInst[] // index 0 = oldest = slot 1 of the Strike chain
  deck: CardInst[] // index 0 = top
  statuses: Status[]
  /** Chosen Style (passive), key "CHAMP:slot" in engine/styles.ts. */
  style?: string
  /** Style bookkeeping (e.g. Second Wind already spent). */
  styleData?: Record<string, number>
  /** Signature combo bookkeeping (e.g. Bruiser Conqueror stacks). */
  comboData?: Record<string, number>
  /** Silenced this turn (from a silence status active when the turn started). */
  silenced?: boolean
  /** Skill cards' effects off this turn (from a skillSilence status active when the turn started). */
  skillSilenced?: boolean
  /** Cards drawn since the last shuffle; the deck reshuffles once a whole deck's worth is drawn. */
  drawsSinceShuffle?: number
  /** Class resource (Mana / Rage / Energy), see engine/resources.ts. Tank has none (pays HP). */
  res?: number
  /** Chain cards whose cost couldn't be paid this turn: they hit, but their effects are off. */
  unpaid?: string[]
  /** Times this side lost HP outside a hit this turn, by source: the opponent (their card effects, Parry, Mark of Assassin)
   *  or itself (own drawbacks). Feeds Rage. */
  otherDmg?: { foe: number; self: number }
  /** Cards this side lost to a discard effect this turn (Charge break, Block streak, Guard Crush), for the UI. */
  discarded?: { card: CardInst; slot: number; reason: string }[]
  /** Field cards this side lost to Cut effects this turn (capped by CUT_CAP). */
  cutTaken?: number
}

export type RulesConfig = {
  handMax: number
  startHand: number
  blockStopsHits: number
  blockStreakDiscard: number
  chargeDraw: number
  /** Class resources + S card costs (engine/resources.ts). Off = every card is free (older card tests, A/B sims). */
  resources: boolean
}

export const DEFAULT_RULES: RulesConfig = {
  handMax: 5,
  startHand: 0, // Q 2026-10-13: start with an empty hand, cards come only from Charge
  blockStopsHits: 2,
  blockStreakDiscard: 3,
  chargeDraw: 1,
  resources: true, // Q 2026-10-15: every S card has a cost
}

/**
 * What happened during the last resolveTurn, in order, for the battle screen to play back.
 * hit = one chain card landing (dmg before cuts, dealt = what got through); hp = any HP change;
 * sweep = a Strike chain going back under the deck.
 */
export type TurnEvent =
  | { k: 'hit'; side: Side; slot: number; uid: string; type: CardType; dmg: number; dealt: number; blocked: boolean; parried: boolean; absorbed: number; crit: boolean }
  | { k: 'hp'; side: Side; delta: number }
  | { k: 'draw'; side: Side; card: CardInst; slot?: number } // slot = index it went to, when not the end of the Field
  | { k: 'discard'; side: Side; uid: string; reason: string }
  | { k: 'sweep'; side: Side; uids: string[] }
  | { k: 'combo'; side: Side; name: string }

export type GameState = {
  turn: number
  players: Record<Side, PlayerState>
  blockStreak: number
  winner: Side | 'draw' | null
  rules: RulesConfig
  rngSeed: number
  log: string[] // human-readable, newest last
  /** Events of the last turn only (reset by resolveTurn). */
  events?: TurnEvent[]
}

export const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')

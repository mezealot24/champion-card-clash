import type { Tuning } from './tuning'
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
/** woundUp = Bruiser Payback (Fury Ascendancy): the next Strike's slot 1 spends all Rage left; a buff the enemy can see */
/** venom = n stacks (Fatal Rhythm Toxic Strike): lose 1 HP per stack at the end of every turn, then 1 stack fades; a debuff */
/** guardBreak = Guard Crush: on your next Strike, blocked hits deal half and a Blocking opponent loses their 2 oldest Field cards */
/**
 * silence = your cards' effects don't fire this turn (Styles and combos still work)
 * shield = absorbs n dmg from hits before HP; lasts until used up or its turns run out
 * parry = the next n hits that get past your Block are deflected and deal 0, nothing goes back (this turn; Q 2026-10-17: a Block is 2 Parries)
 */
/** ignite = burning (Pyromancer, Q 2026-10-17): n = stacks; see IGNITE_* in styles.ts. chill = Cryomancer's slow (n = stacks, CHILL_*).
 * frozen = marker for "can't Strike this turn" (lasts 1 turn longer than its noStrike so cards can read it). skillSilence = Skill cards' effects off (Bitter Cold). subZero = next Strike: every clean hit gives 1 Chill (Arcane Sub-Zero). thaw = can't be Frozen (after a Freeze, Cryomancer) */
export type StatusKind = 'noStrike' | 'noBlock' | 'noCharge' | 'blockPlus' | 'trueDmg' | 'guardBreak' | 'silence' | 'shield' | 'parry' | 'vulnerable' | 'deathMark' | 'ignite' | 'chill' | 'frozen' | 'skillSilence' | 'subZero' | 'frozenTomb' | 'thaw' | 'venom' | 'woundUp'
/** n = size: blockPlus (Block stops n more hits; negative = fewer), shield (points left), parry (hits left) */
/** A side loses at most this many Field cards to Cut effects per turn (Claude default 2026-10-16). Charge break doesn't count. */
export const CUT_CAP = 2

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
  /** Style bookkeeping (e.g. Lifeline already spent). */
  styleData?: Record<string, number>
  /** Signature combo bookkeeping (e.g. Bruiser Momentum stacks). */
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
  /** last turn this side lost HP (lostHp card condition) */
  lostHpTurn?: number
  /** Cards this side lost to a discard effect this turn (Charge break, Block streak, Guard Crush), for the UI. */
  discarded?: { card: CardInst; slot: number; reason: string }[]
  /** Field cards this side lost to Cut effects this turn (capped by CUT_CAP). */
  cutTaken?: number
  /** Loadout pieces in play (engine/loadout.ts keys: "oath:TK:o1", "minor:m2", "asc:TK:1:A3"). They act like extra Styles. */
  perks?: string[]
  /** This player's own numbers when their loadout changes some (tuningOf(state, side)); none = the game's. */
  tuning?: Tuning
  /** Field size for this player when a loadout changes it (default: rules.handMax). */
  fieldMax?: number
  /** S card cost changes from the loadout: +pct % then +flat (Tank: HP). */
  costMod?: { pct: number; flat: number; hpPct?: number }
  /** Loadout bookkeeping (once-per-match pieces and the like). */
  perkData?: Record<string, number>
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
  /** Champion + Style numbers this game runs on (engine/tuning.ts); missing = defaults */
  tuning?: Tuning
  rngSeed: number
  log: string[] // human-readable, newest last
  /** Events of the last turn only (reset by resolveTurn). */
  events?: TurnEvent[]
}

export const other = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1')

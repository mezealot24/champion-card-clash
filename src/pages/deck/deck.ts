// Player deck builder rules (design/customization-options-2026-10-18.md, Q round 2): build from your own Champion's pool,
// exactly deck_size cards, at most deck_max_copies of each (both in Admin → Config). Saved per Champion on this device.
// Style cards (cards.style_only) stay as Admin set them and fill their own slots, so the player picks the rest.
import { isEffectMissing, type CardDef, type CardRowLike } from '../../engine'
import { inStyleDeck } from '../../engine/state'

export type DeckRow = CardRowLike & { champion_id: string; name?: string }
/** card id → copies */
export type DeckList = Record<string, number>
export type DeckRules = { size: number; maxCopies: number }

export const DEFAULT_DECK_RULES: DeckRules = { size: 25, maxCopies: 2 }

/** game_config deck_size / deck_max_copies → rules (bad values keep the defaults). */
export function deckRulesFromConfig(rows: { key: string; value: unknown }[] = []): DeckRules {
  const num = (key: string, d: number) => {
    const v = rows.find((r) => r.key === key)?.value
    return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : d
  }
  return { size: num('deck_size', DEFAULT_DECK_RULES.size), maxCopies: num('deck_max_copies', DEFAULT_DECK_RULES.maxCopies) }
}

/** Style cards: tied to a Style (or swapped out by one), so Admin's deck decides them, not the player. */
const isStyleCard = (r: DeckRow) => !!r.style_only

/** Cards the player may pick: the Champion's cards that belong to no Style and whose effect works in the engine. */
export function deckPool(rows: DeckRow[]): DeckRow[] {
  return rows.filter((r) => !isStyleCard(r) && !isEffectMissing(r.id, r.effect, r.effect_json))
}

/** Style cards in the deck under this Style (always in, they don't count toward the player's picks). */
export function styleCards(rows: DeckRow[], style?: string): DeckRow[] {
  return rows.filter((r) => isStyleCard(r) && r.in_deck !== false && inStyleDeck({ styleOnly: r.style_only ?? null } as CardDef, style))
}

/** How many cards the player picks: deck size minus the Style's own cards. */
export function pickTarget(rows: DeckRow[], style: string | undefined, rules: DeckRules): number {
  return Math.max(0, rules.size - styleCards(rows, style).reduce((n, r) => n + r.copies, 0))
}

/** Admin's deck (cards.in_deck) as a list, for a fresh start or Reset. */
export function defaultList(rows: DeckRow[]): DeckList {
  return Object.fromEntries(rows.filter((r) => !isStyleCard(r) && r.in_deck !== false).map((r) => [r.id, r.copies]))
}

export const countOf = (list: DeckList) => Object.values(list).reduce((n, c) => n + c, 0)

/** Why a list can't be played (empty = fine). */
export function deckProblems(list: DeckList, rows: DeckRow[], style: string | undefined, rules: DeckRules): string[] {
  const pool = new Set(deckPool(rows).map((r) => r.id))
  const out: string[] = []
  const gone = Object.keys(list).filter((id) => list[id] > 0 && !pool.has(id))
  if (gone.length) out.push(`No longer in the pool: ${gone.join(', ')}`)
  const over = Object.keys(list).filter((id) => list[id] > rules.maxCopies)
  if (over.length) out.push(`More than ${rules.maxCopies} copies: ${over.join(', ')}`)
  const target = pickTarget(rows, style, rules)
  const n = countOf(list)
  if (n !== target) out.push(n < target ? `Add ${target - n} more card${target - n > 1 ? 's' : ''}` : `Remove ${n - target} card${n - target > 1 ? 's' : ''}`)
  return out
}

/**
 * The rows a match is built from (pass to buildDeck): the saved list when it is still legal, else Admin's deck.
 * custom = the player's own list is used.
 */
export function deckRows(rows: DeckRow[], list: DeckList | null, style: string | undefined, rules: DeckRules): { rows: DeckRow[]; custom: boolean } {
  if (!list || deckProblems(list, rows, style, rules).length) return { rows, custom: false }
  const picked = deckPool(rows)
    .filter((r) => (list[r.id] ?? 0) > 0)
    .map((r) => ({ ...r, copies: list[r.id], in_deck: true }))
  return { rows: [...picked, ...styleCards(rows, style)], custom: true }
}

const sameList = (a: DeckList, b: DeckList) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0))
}

// ---- saved on this device (no player accounts yet) ----
const key = (champ: string) => `ccc-deck-${champ}`
// last save this page made, for when storage is blocked (private window)
const mem = new Map<string, DeckList | null>()

export function loadDeck(champ: string): DeckList | null {
  if (mem.has(champ)) return mem.get(champ) ?? null
  try {
    const raw = JSON.parse(localStorage.getItem(key(champ)) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return null
    const out: DeckList = {}
    for (const [id, n] of Object.entries(raw)) if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[id] = n
    return out
  } catch {
    return null
  }
}

/** Saving Admin's own deck clears the saved list, so later Admin changes to the deck reach this player. */
export function saveDeck(champ: string, list: DeckList, rows: DeckRow[]) {
  const clean = sameList(list, defaultList(rows)) ? null : Object.fromEntries(Object.entries(list).filter(([, n]) => n > 0))
  mem.set(champ, clean)
  try {
    if (!clean) localStorage.removeItem(key(champ))
    else localStorage.setItem(key(champ), JSON.stringify(clean))
  } catch {
    /* private window: the deck lasts until the page closes */
  }
}

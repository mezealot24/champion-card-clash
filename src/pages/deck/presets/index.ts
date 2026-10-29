// Deck presets (Q 2026-10-29): 2 ready-made builds per class, each with a 0-10 stat overview. One file per class so
// the class threads don't collide. A preset is checked against today's cards and trees before it can be used: a card
// cut in Admin or a tree change makes it "out of date" instead of handing the player a broken build.
import { OATHS, treePoints, validAsc, type CardDef } from '../../../engine'
import { inStyleDeck } from '../../../engine/state'
import { buildStats, type DeckStats } from '../../../engine/deckStats'
import { deckProblems, deckRows, loadDeck, saveDeck, type DeckRow, type DeckRules } from '../deck'
import type { SavedLoadout } from '../../loadout/loadout'
import { AS_PRESETS } from './AS'
import { BR_PRESETS } from './BR'
import { MG_PRESETS } from './MG'
import { TK_PRESETS } from './TK'
import type { Preset } from './types'

export type { Preset } from './types'

export const PRESETS: Record<string, Preset[]> = { TK: TK_PRESETS, BR: BR_PRESETS, AS: AS_PRESETS, MG: MG_PRESETS }

export type PresetView = {
  preset: Preset
  /** hand-set stats, else computed from the cards */
  stats: DeckStats
  /** what the cards say (shown next to hand-set stats in Admin / tests) */
  auto: DeckStats
  /** why it can't be used today (empty = fine) */
  problems: string[]
}

/** Why a preset can't be used with today's data (empty = fine). */
export function presetProblems(champ: string, p: Preset, rows: DeckRow[], playable: string[], points: number, rules: DeckRules): string[] {
  const out: string[] = []
  if (!playable.includes(p.style)) out.push(`Style ${p.style} is not playable`)
  if (!OATHS[champ]?.some((o) => o.id === p.oath)) out.push(`no Oath ${p.oath}`)
  const pts = treePoints(p.style, points)
  if (!validAsc(p.asc, pts, p.style) || p.asc.length !== pts) out.push(`Ascendancy must spend all ${pts} points on a legal path`)
  out.push(...deckProblems(p.deck, rows, p.style, rules))
  return out
}

/** The overview of any build: the deck as it would be played, plus its Style, Oath and Ascendancy. */
export function statsOf(champ: { id: string; hp_max: number }, rows: DeckRow[], list: Record<string, number> | null, style: string | undefined, oath: string | undefined, asc: string[], rules: DeckRules): DeckStats {
  const deck = playedCards(deckRows(rows, list, style, rules).rows, style)
  return buildStats({ champ: champ.id, hpMax: champ.hp_max, cards: deck, style, oath, asc })
}

// Admin's deck rows still hold every Style's cards: keep only the ones this Style plays
const playedCards = (rows: DeckRow[], style: string | undefined) =>
  rows.filter((r) => r.in_deck !== false && inStyleDeck({ styleOnly: r.style_only ?? null } as CardDef, style))

export function presetViews(champ: { id: string; hp_max: number }, rows: DeckRow[], playable: string[], points: number, rules: DeckRules): PresetView[] {
  return (PRESETS[champ.id] ?? []).map((preset) => {
    const auto = statsOf(champ, rows, preset.deck, preset.style, preset.oath, preset.asc, rules)
    return { preset, auto, stats: preset.stats ?? auto, problems: presetProblems(champ.id, preset, rows, playable, points, rules) }
  })
}

/** Use a preset: its Style, Oath and tree go into the saved loadout, its deck becomes the player's deck. */
export function applyPreset(champ: string, p: Preset, rows: DeckRow[], saved: SavedLoadout): SavedLoadout {
  saveDeck(champ, p.deck, rows)
  return { ...saved, style: p.style, oath: p.oath, asc: { ...saved.asc, [p.style]: [...p.asc] } }
}

/** The preset the player's current picks match, if any. */
export function activePreset(champ: string, saved: SavedLoadout, rows: DeckRow[], rules: DeckRules): Preset | undefined {
  const same = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x))
  return (PRESETS[champ] ?? []).find((p) => {
    if (saved.style !== p.style || saved.oath !== p.oath || !same(saved.asc?.[p.style], p.asc)) return false
    const mine = deckRows(rows, loadDeck(champ), p.style, rules)
    const theirs = deckRows(rows, p.deck, p.style, rules)
    const key = (rs: DeckRow[]) => rs.map((r) => `${r.id}x${r.copies}`).sort().join()
    return key(playedCards(mine.rows, p.style)) === key(playedCards(theirs.rows, p.style))
  })
}

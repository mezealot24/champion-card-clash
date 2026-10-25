// Player loadout saved on this device, per Champion (no player accounts yet): the picked Style (path), Oath and
// Ascendancy nodes per Style. Q 2026-10-25: a Style and a full tree are required (no "no Style"); a save from before
// that has no style, so the player picks one on the Path step (readiness below).
// A Minor saved before 2026-10-25 is dropped (Sigil II is off). A tree saved for an older rev of its Style (TreeData.rev,
// e.g. Bruiser v2) starts empty.
// Everything is open in Beta (Q 2026-10-20); points per Style = game_config asc_points (default 5) + the tree's bonusPoints.
import { OATHS, TREES, treePoints, validAsc, type Loadout } from '../../engine'

export type SavedLoadout = { style?: string; oath?: string; minor?: string; asc?: Record<string, string[]>; ascRev?: Record<string, number> }

export const DEFAULT_ASC_POINTS = 5

export function ascPointsFromConfig(rows: { key: string; value: unknown }[] = []): number {
  const v = rows.find((r) => r.key === 'asc_points')?.value
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 8 ? v : DEFAULT_ASC_POINTS
}

const key = (champ: string) => `ccc-loadout-${champ}`
const mem = new Map<string, SavedLoadout>()

export function loadLoadout(champ: string): SavedLoadout {
  if (mem.has(champ)) return mem.get(champ)!
  try {
    const raw = JSON.parse(localStorage.getItem(key(champ)) ?? '{}') as SavedLoadout
    return raw && typeof raw === 'object' ? dropOldTrees(raw) : {}
  } catch {
    return {}
  }
}

/** Trees saved for an older rev of their Style are dropped (their node ids now mean other nodes). */
export function dropOldTrees(l: SavedLoadout): SavedLoadout {
  if (!l.asc) return l
  const asc = Object.fromEntries(Object.entries(l.asc).filter(([style]) => (TREES[style]?.rev ?? 0) === (l.ascRev?.[style] ?? 0)))
  return { ...l, asc }
}

export function saveLoadout(champ: string, saved: SavedLoadout) {
  const ascRev = Object.fromEntries(Object.keys(saved.asc ?? {}).flatMap((style) => (TREES[style]?.rev ? [[style, TREES[style].rev!]] : [])))
  const l = { ...saved, ascRev }
  mem.set(champ, l)
  try {
    localStorage.setItem(key(champ), JSON.stringify(l))
  } catch {
    /* private window: kept until the page closes */
  }
}

/** What the engine gets for this Champion and Style (pieces that no longer exist are dropped). */
export function loadoutFor(champ: string, style: string | undefined, points: number, saved = loadLoadout(champ)): Loadout | undefined {
  const oath = OATHS[champ]?.some((o) => o.id === saved.oath) ? saved.oath : undefined
  const nodes = style ? (saved.asc?.[style] ?? []) : []
  const pts = treePoints(style, points)
  const asc = validAsc(nodes, pts, style) ? nodes : []
  if (!oath && !asc.length) return undefined
  return { oath, asc, points: pts }
}

/** The saved Style when it is still one of the Champion's playable Styles (old saves have none). */
export function savedStyle(saved: SavedLoadout, playable: string[]): string | undefined {
  return saved.style && playable.includes(saved.style) ? saved.style : undefined
}

/** Pre-battle steps in order (Q 2026-10-25): Champion → Path (Style + Ascendancy) → Oath → Deck → Fight. */
export const STEPS = ['champion', 'path', 'oath', 'deck', 'fight'] as const
export type Step = (typeof STEPS)[number]

/** What is still missing before a fight: a Style, every Ascendancy point spent, an Oath. */
export function loadoutGaps(champ: string, style: string | undefined, points: number, saved: SavedLoadout): { style: boolean; asc: number; oath: boolean } {
  const pts = treePoints(style, points)
  const nodes = (style && saved.asc?.[style]) || []
  const taken = style && TREES[style] && validAsc(nodes, pts, style) ? nodes.length : 0
  return {
    style: !style,
    // a Style with no tree in the engine has nothing to spend
    asc: style && TREES[style] ? pts - taken : 0,
    oath: !!OATHS[champ]?.length && !OATHS[champ].some((o) => o.id === saved.oath),
  }
}

/** The first step that still needs the player (or 'fight' when all is set). Deck always has a legal default. */
export function firstOpenStep(champ: string, style: string | undefined, points: number, saved: SavedLoadout): Step {
  const g = loadoutGaps(champ, style, points, saved)
  if (g.style || g.asc > 0) return 'path'
  if (g.oath) return 'oath'
  return 'fight'
}

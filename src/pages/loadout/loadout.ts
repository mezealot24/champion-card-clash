// Player loadout saved on this device, per Champion (no player accounts yet): Oath and Ascendancy nodes per Style.
// A Minor saved before 2026-10-25 is dropped (Sigil II is off). A tree saved for an older rev of its Style (TreeData.rev,
// e.g. Bruiser v2) starts empty.
// Everything is open in Beta (Q 2026-10-20); points per Style = game_config asc_points (default 5) + the tree's bonusPoints.
import { OATHS, TREES, treePoints, validAsc, type Loadout } from '../../engine'

export type SavedLoadout = { oath?: string; minor?: string; asc?: Record<string, string[]>; ascRev?: Record<string, number> }

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

// Player loadout saved on this device, per Champion (no player accounts yet): Oath and Ascendancy nodes per Style.
// A Minor saved before 2026-10-25 is dropped (Sigil II is off).
// Everything is open in Beta (Q 2026-10-20); points per Style = game_config asc_points (default 5) + the tree's bonusPoints.
import { OATHS, treePoints, validAsc, type Loadout } from '../../engine'

export type SavedLoadout = { oath?: string; minor?: string; asc?: Record<string, string[]> }

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
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function saveLoadout(champ: string, l: SavedLoadout) {
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

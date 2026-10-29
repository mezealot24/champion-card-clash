// Arcade boss (Chimera, engine/boss.ts) plays every class at once: a Style, a capstone, cards and a resource bar per class.
// The rest of the engine reads one class per player (championId, style, res), so the boss runs each class's code
// "as" that class: inClass swaps championId / style / res in, runs it, and puts them back. No imports: styles.ts,
// state.ts and resources.ts all use it.
import type { CardInst, PlayerState } from './types'

/** Run fn with p acting as class `cls` (no-op for a normal player or the class it already is). */
export function inClass<T>(p: PlayerState, cls: string, fn: () => T): T {
  const b = p.boss
  if (!b || p.championId === cls || !(cls in b.styles)) return fn()
  const prev = p.championId
  b.res[prev] = p.res ?? 0
  p.championId = cls
  p.style = b.styles[cls]
  p.res = b.res[cls] ?? 0
  try {
    return fn()
  } finally {
    b.res[cls] = p.res ?? 0
    p.championId = prev
    p.style = b.styles[prev]
    p.res = b.res[prev] ?? 0
  }
}

/** The class a card plays as: its id prefix (MG-049 → MG) for the boss, else the player's Champion. */
export const classOf = (p: PlayerState, card: CardInst) => {
  const c = card.def.id.split('-')[0]
  return p.boss && c in p.boss.styles ? c : p.championId
}

/** The classes this player plays: the boss's every class, else its own Champion. */
export const classesOf = (p: PlayerState) => (p.boss ? p.boss.classes : [p.championId])

/** Is this Style on (the boss has one per class)? */
export const styleOn = (p: PlayerState, key: string) => p.style === key || !!p.boss && Object.values(p.boss.styles).includes(key)

/** A class's resource bar (the boss keeps one per class). */
export const resIn = (p: PlayerState, cls: string) => (p.championId === cls || !p.boss ? (p.res ?? 0) : (p.boss.res[cls] ?? 0))

/** Every bar of a player, by class (synced with the live one). */
export const allRes = (p: PlayerState): Record<string, number> => (p.boss ? { ...p.boss.res, [p.championId]: p.res ?? 0 } : { [p.championId]: p.res ?? 0 })

/** Wrap every function of a hook object so it runs as class `cls`. */
export function wrapInClass<T extends object>(p: PlayerState, cls: string, h: T): T {
  if (!p.boss) return h
  return Object.fromEntries(
    Object.entries(h).map(([k, v]) => [k, typeof v === 'function' ? (...a: unknown[]) => inClass(p, cls, () => (v as (...x: unknown[]) => unknown)(...a)) : v]),
  ) as T
}

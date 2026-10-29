// Arcade (Q 2026-10-28): fight a ladder of stages like a fighting game. Opponents are random (Champion + Style),
// no pair twice in a run, and the AI gets tougher every stage. The run is kept on this device so a closed tab resumes.
// Ties to the AI Ladder idea in design/customization-options-2026-10-18.md (5 tiers).
import { capstonesOf, type BossClass } from '../../engine'

/** Random stages before the boss. A run is ARCADE_STAGES + 1 fights (the boss is the last). */
export const ARCADE_STAGES = 5

/** AI strength per stage: depth = turns looked ahead, noise = share of random picks (AI v2 default is depth 2, 0.08). */
export const TIERS = [
  { name: 'Rookie', depth: 1, noise: 0.4 },
  { name: 'Fighter', depth: 1, noise: 0.15 },
  { name: 'Veteran', depth: 2, noise: 0.2 },
  { name: 'Champion', depth: 2, noise: 0.08 },
  { name: 'Legend', depth: 2, noise: 0.02 },
] as const

export type Tier = { name: string; depth: number; noise: number }
export type Foe = { champ: string; style: string }

/**
 * Final boss (Q 2026-10-29, "like Seth in Street Fighter 4"): Chimera, the black shadow of one Champion that plays every
 * class at once: a random Style per class (all on), one capstone of each, perClass cards of each and every resource bar
 * (engine/boss.ts). hp and perClass are starting numbers for playtest.
 */
export const BOSS = { id: 'BOSS', name: 'Chimera', hp: 240, perClass: 10 } as const
export const BOSS_TIER: Tier = { name: 'Boss', depth: 2, noise: 0.02 }
export const isBoss = (f?: Foe) => f?.champ === BOSS.id

export type ArcadeRun = {
  /** the player's Champion and Style for the whole run */
  champ: string
  style: string
  stages: Foe[]
  /** index of the next stage to fight (ARCADE_STAGES = cleared) */
  at: number
  /** times the player chose Continue after a loss */
  continues: number
}

export const tierOf = (stage: number, run?: ArcadeRun): Tier => (isBoss(run?.stages[stage]) ? BOSS_TIER : TIERS[Math.min(stage, TIERS.length - 1)])
export const cleared = (run: ArcadeRun) => run.at >= run.stages.length

/**
 * Stage list: a shuffled pool of every playable (Champion, Style), no pair twice and, when the pool allows it,
 * never the same Champion two stages in a row. A pool smaller than the ladder repeats itself.
 */
export function rollStages(pool: Foe[], n = ARCADE_STAGES, rand: () => number = Math.random): Foe[] {
  if (!pool.length) return []
  const shuffle = (xs: Foe[]) => {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const out: Foe[] = []
  let bag: Foe[] = []
  while (out.length < n) {
    if (!bag.length) bag = shuffle(pool)
    const prev = out[out.length - 1]?.champ
    const i = bag.findIndex((f) => f.champ !== prev)
    out.push(bag.splice(i >= 0 ? i : 0, 1)[0])
  }
  return out
}

export function newRun(champ: string, style: string, pool: Foe[], rand?: () => number): ArcadeRun {
  const stages = rollStages(pool, ARCADE_STAGES, rand)
  return { champ, style, stages: stages.length ? [...stages, { champ: BOSS.id, style: '' }] : [], at: 0, continues: 0 }
}

/** The boss's kit for one fight: per Champion a random Style and one of its capstones; the first is the shadow it wears. */
export function rollBossKit(pool: Foe[], rand: () => number = Math.random): BossClass[] {
  const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(rand() * xs.length)]
  const champs = [...new Set(pool.map((f) => f.champ))]
  const shadow = Math.floor(rand() * champs.length)
  return [...champs.slice(shadow), ...champs.slice(0, shadow)].map((champ) => {
    const style = pick(pool.filter((f) => f.champ === champ))!.style
    return { champ, style, capstone: pick(capstonesOf(style)) }
  })
}

// ---- saved on this device ----
const KEY = 'ccc-arcade'
const CLEARS = 'ccc-arcade-clears'

export function loadRun(): ArcadeRun | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ArcadeRun | null
    return r && typeof r.champ === 'string' && Array.isArray(r.stages) && r.stages.length && typeof r.at === 'number' ? r : null
  } catch {
    return null
  }
}

export function saveRun(run: ArcadeRun | null) {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run))
    else localStorage.removeItem(KEY)
  } catch {
    /* private window: the run lasts until the page closes */
  }
}

/** Arcade clears per Champion. */
export function loadClears(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CLEARS) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

export function addClear(champ: string) {
  const c = loadClears()
  c[champ] = (c[champ] ?? 0) + 1
  try {
    localStorage.setItem(CLEARS, JSON.stringify(c))
  } catch {
    /* not remembered */
  }
}

/** A random (Champion, Style) for Versus when the opponent is left on Random. */
export function randomFoe(pool: Foe[], rand: () => number = Math.random): Foe | undefined {
  return pool[Math.floor(rand() * pool.length)]
}

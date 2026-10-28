// Arcade (Q 2026-10-28): fight a ladder of stages like a fighting game. Opponents are random (Champion + Style),
// no pair twice in a run, and the AI gets tougher every stage. The run is kept on this device so a closed tab resumes.
// Ties to the AI Ladder idea in design/customization-options-2026-10-18.md (5 tiers).

export const ARCADE_STAGES = 5

/** AI strength per stage: depth = turns looked ahead, noise = share of random picks (AI v2 default is depth 2, 0.08). */
export const TIERS = [
  { name: 'Rookie', depth: 1, noise: 0.4 },
  { name: 'Fighter', depth: 1, noise: 0.15 },
  { name: 'Veteran', depth: 2, noise: 0.2 },
  { name: 'Champion', depth: 2, noise: 0.08 },
  { name: 'Legend', depth: 2, noise: 0.02 },
] as const

export type Tier = (typeof TIERS)[number]
export type Foe = { champ: string; style: string }

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

export const tierOf = (stage: number): Tier => TIERS[Math.min(stage, TIERS.length - 1)]
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
  return { champ, style, stages: rollStages(pool, ARCADE_STAGES, rand), at: 0, continues: 0 }
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

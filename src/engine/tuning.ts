// Champion + Style numbers a super_admin can tune from the Admin console (Q 2026-10-18).
// The defaults here are the game as designed; the DB stores only the values that differ:
// champions.params (group "TK", "BR", …: class resource + signature combo) and
// champion_styles.params (group "TK:1", "MG:2", …). DB wins; a key missing there falls back to these defaults.
// The engine reads them from GameState.tuning (createGame opts.tuning), so a game keeps the numbers it started with.

export type TuneField = {
  key: string
  label: string
  def: number
  min?: number
  max?: number
  /** non-integer values allowed (default: whole numbers only) */
  decimal?: boolean
  help?: string
}

/** Every tunable number, by group. Group = champion id (class) or "CHAMP:slot" (Style). The order is the Admin form's order. */
export const TUNING_FIELDS = {
  // ---- Tank ----
  TK: [
    { key: 'sCost', label: 'S card HP cost', def: 10, min: 0, help: 'Default cost of a Tank S card (paid in HP) when cards.cost is empty' },
    { key: 'comboHealPct', label: 'P+K+P combo heal %', def: 10, min: 0, max: 100, help: '% of current HP healed when the enemy Blocks one of the combo cards' },
  ],
  'TK:1': [
    { key: 'hpPct', label: 'Second Wind HP line %', def: 30, min: 1, max: 100, help: 'Heals only while HP is below this % of Max HP' },
    { key: 'healPctPerHit', label: 'Heal % of missing HP per hit', def: 4, min: 0, max: 100 },
  ],
  'TK:2': [
    { key: 'perHitTaken', label: 'Max HP per hit taken', def: 1, min: 0 },
    { key: 'perHitBlocked', label: 'Max HP per hit Blocked', def: 2, min: 0 },
    { key: 'perFacing', label: 'Max HP per facing pair', def: 3, min: 0 },
    { key: 'maxHpCap', label: 'Max HP cap', def: 500, min: 1 },
    { key: 'hpPerDmg', label: 'Max HP grown per +1 dmg', def: 20, min: 1 },
  ],
  // ---- Bruiser ----
  BR: [
    { key: 'cap', label: 'Rage cap', def: 20, min: 0 },
    { key: 'start', label: 'Rage at start', def: 0, min: 0 },
    { key: 'sCost', label: 'S card Rage cost', def: 10, min: 0, help: 'When cards.cost is empty' },
    { key: 'unpaidDmgPct', label: 'Unpaid S base dmg %', def: 50, min: 0, max: 100 },
    { key: 'perHitTaken', label: 'Rage per hit taken / enemy HP loss', def: 2, min: 0 },
    { key: 'perSelfDmg', label: 'Rage per own drawback HP loss', def: 1, min: 0 },
    { key: 'perCleanHit', label: 'Rage per clean hit', def: 1, min: 0 },
    { key: 'quietLoss', label: 'Rage lost on a quiet turn', def: 1, min: 0, help: 'Nobody Struck and you lost no HP' },
    { key: 'quietSafeHpPct', label: 'No quiet-turn loss below HP %', def: 30, min: 0, max: 100 },
    { key: 'guardCrushTurns', label: 'S>P>P Guard Crush turns', def: 3, min: 1 },
    { key: 'guardCrushBlockedPct', label: 'Guard Crush dmg % through Block', def: 50, min: 0, max: 100 },
    { key: 'guardCrushDiscard', label: 'Guard Crush Field cards discarded', def: 2, min: 0, max: 5 },
  ],
  'BR:1': [
    { key: 'hpPct', label: 'Fury HP line %', def: 50, min: 1, max: 100, help: 'Active while HP is below this % at the start of the Strike' },
    { key: 'bonusDmg', label: 'Fury bonus dmg', def: 10 },
    { key: 'slots', label: 'Fury slots (from slot 1)', def: 2, min: 0, max: 5 },
  ],
  'BR:2': [
    { key: 'conquerorMax', label: 'Conqueror max stacks', def: 6, min: 1 },
    { key: 'dmgPerStack', label: 'Dmg per Conqueror stack', def: 1 },
    { key: 'tenacityTurns', label: 'Tenacity turns', def: 2, min: 0 },
    { key: 'omnivampPct', label: 'Omnivamp % at max stacks', def: 10, min: 0, max: 100 },
    { key: 'chargeBreakTakenPct', label: 'Extra dmg % taken on charge break at max', def: 30, min: 0 },
    { key: 'blockLoss', label: 'Stacks lost per Block', def: 1, min: 0 },
  ],
  // ---- Assassin ----
  AS: [
    { key: 'cap', label: 'Energy cap', def: 3, min: 0 },
    { key: 'start', label: 'Energy at start', def: 3, min: 0 },
    { key: 'sCost', label: 'S card Energy cost', def: 1, min: 0, help: 'When cards.cost is empty' },
    { key: 'perTurn', label: 'Energy per turn', def: 1, min: 0 },
    { key: 'markBurstPct', label: 'Mark of Assassin burst %', def: 50, min: 0, help: '% of the chain\'s total dmg' },
  ],
  'AS:1': [
    { key: 'startDraw', label: 'Cards on Field at start', def: 3, min: 0, max: 5 },
    { key: 'dmgPerEnergy', label: 'Overdrive dmg per Energy', def: 2 },
    { key: 'minChain', label: 'Overdrive min chain', def: 3, min: 1, max: 5 },
    { key: 'dualDraw', label: 'Acceleration draw', def: 2, min: 0 },
  ],
  'AS:2': [
    { key: 'every', label: 'Critical every Nth attack', def: 4, min: 1 },
    { key: 'critMult', label: 'Critical multiplier', def: 3, min: 1, decimal: true },
    { key: 'redCritMult', label: 'Critical multiplier vs low HP', def: 4, min: 1, decimal: true },
    { key: 'redHpPct', label: 'Low HP line %', def: 30, min: 0, max: 100 },
    { key: 'blockedCritPct', label: 'Blocked Critical dmg %', def: 50, min: 0, max: 100 },
  ],
  // ---- Mage ----
  MG: [
    { key: 'cap', label: 'Mana cap', def: 5, min: 0 },
    { key: 'start', label: 'Mana at start', def: 0, min: 0 },
    { key: 'sCost', label: 'S card Mana cost', def: 2, min: 0, help: 'When cards.cost is empty' },
    { key: 'perChargeBlock', label: 'Mana per Charge / Block', def: 1, min: 0 },
    { key: 'perCleanPK', label: 'Mana per clean P/K hit', def: 1, min: 0 },
    { key: 'comboNoBlockTurns', label: 'S+S+S: enemy no-Block turns', def: 1, min: 0 },
  ],
  'MG:1': [
    { key: 'igniteMax', label: 'Ignite max stacks', def: 4, min: 1 },
    { key: 'igniteTurns', label: 'Ignite turns', def: 3, min: 1 },
    { key: 'igniteFlat', label: 'Ignite HP per stack', def: 2, min: 0 },
    { key: 'ignitePctMaxHp', label: 'Ignite % Max HP per stack', def: 1, min: 0, decimal: true },
    { key: 'healCutPerStack', label: 'Heal cut % per stack', def: 25, min: 0, max: 100 },
    { key: 'healCutMax', label: 'Heal cut max %', def: 50, min: 0, max: 100 },
    { key: 'moltenMaxMana', label: 'Molten Shield max Mana', def: 3, min: 0 },
    { key: 'moltenShieldPerMana', label: 'Molten Shield per Mana', def: 5, min: 0 },
  ],
  'MG:2': [
    { key: 'chillMax', label: 'Chill stacks to freeze', def: 4, min: 1 },
    { key: 'chillTurns', label: 'Chill turns', def: 3, min: 1 },
    { key: 'chillDmgCut', label: 'Dmg cut % per Chill', def: 10, min: 0, max: 100 },
    { key: 'shatterPct', label: 'Shatter % Max HP', def: 15, min: 0, max: 100 },
    { key: 'frostArmorShield', label: 'Frost Armor Shield', def: 40, min: 0 },
    { key: 'deepFreezeMana', label: 'Deep Freeze Mana cost', def: 1, min: 0 },
    { key: 'tombHpPct', label: 'Frozen Tomb HP line %', def: 30, min: 0, max: 100 },
    { key: 'tombHeal', label: 'Frozen Tomb heal', def: 10, min: 0 },
    { key: 'tombHealPerMana', label: 'Frozen Tomb heal per Mana', def: 5, min: 0 },
    { key: 'tombMeltPct', label: 'Shield left → HP %', def: 50, min: 0, max: 100 },
  ],
} as const satisfies Record<string, readonly TuneField[]>

type Fields = typeof TUNING_FIELDS
export type TuningGroup = keyof Fields
/** Fully resolved numbers: every group, every key. */
export type Tuning = { [G in TuningGroup]: { [F in Fields[G][number] as F['key']]: number } }
/** What the DB holds: any subset. */
export type TuningOverrides = Partial<Record<string, Record<string, unknown>>>

export const TUNING_GROUPS = Object.keys(TUNING_FIELDS) as TuningGroup[]

export const isTuningGroup = (g: string): g is TuningGroup => g in TUNING_FIELDS

/** Defaults filled in under any DB overrides. Unknown groups / keys and non-numbers are ignored. */
export function resolveTuning(overrides: TuningOverrides = {}): Tuning {
  const out: Record<string, Record<string, number>> = {}
  for (const g of TUNING_GROUPS) {
    const o = overrides[g] ?? {}
    out[g] = Object.fromEntries(
      (TUNING_FIELDS[g] as readonly TuneField[]).map((f) => {
        const v = o[f.key]
        return [f.key, typeof v === 'number' && Number.isFinite(v) ? v : f.def]
      }),
    )
  }
  return out as Tuning
}

export const DEFAULT_TUNING: Tuning = resolveTuning()

/** champions.params + champion_styles.params rows → overrides keyed by group. */
export function tuningFromRows(
  champions: { id: string; params?: Record<string, unknown> | null }[] = [],
  styles: { champion_id: string; slot: number; params?: Record<string, unknown> | null }[] = [],
): TuningOverrides {
  const out: TuningOverrides = {}
  for (const c of champions) if (c.params) out[c.id] = c.params
  for (const s of styles) if (s.params) out[`${s.champion_id}:${s.slot}`] = s.params
  return out
}

/** The numbers a game runs on (older saved states and hand-made test states have none: defaults). */
export const tuningOf = (state: { tuning?: Tuning }): Tuning => state.tuning ?? DEFAULT_TUNING

/** game_config keys the engine reads (Admin → Config), mapped to RulesConfig. Other keys (deck_size, dmg_budget…) are for the editors. */
export const RULE_KEYS = {
  hand_max: 'handMax',
  start_hand: 'startHand',
  block_stops_hits: 'blockStopsHits',
  block_streak_discard: 'blockStreakDiscard',
  charge_draw: 'chargeDraw',
} as const

/** game_config rows → the rules they override (non-numbers are ignored). */
export function rulesFromConfig(rows: { key: string; value: unknown }[] = []): Partial<Record<(typeof RULE_KEYS)[keyof typeof RULE_KEYS], number>> {
  const out: Partial<Record<(typeof RULE_KEYS)[keyof typeof RULE_KEYS], number>> = {}
  for (const r of rows) {
    const k = RULE_KEYS[r.key as keyof typeof RULE_KEYS]
    if (k && typeof r.value === 'number' && Number.isFinite(r.value)) out[k] = r.value
  }
  return out
}

// ---- Admin form helpers ----

/** One group's overrides as stored in champions.params / champion_styles.params. */
export type TuningParams = Record<string, number>

/** Fields outside min..max, or not whole numbers where they must be. Empty = fine. */
export function tuningErrors(group: TuningGroup, params: TuningParams): string[] {
  return (TUNING_FIELDS[group] as readonly TuneField[]).flatMap((f) => {
    const v = params[f.key]
    if (v === undefined) return []
    if (!Number.isFinite(v)) return [`${f.label}: not a number`]
    if (!f.decimal && !Number.isInteger(v)) return [`${f.label}: whole numbers only`]
    if (f.min !== undefined && v < f.min) return [`${f.label}: at least ${f.min}`]
    if (f.max !== undefined && v > f.max) return [`${f.label}: at most ${f.max}`]
    return []
  })
}

/** What gets saved: only the numbers that differ from the defaults. */
export function cleanParams(group: TuningGroup, params: TuningParams): TuningParams {
  const defs = new Map((TUNING_FIELDS[group] as readonly TuneField[]).map((f) => [f.key, f.def]))
  return Object.fromEntries(Object.entries(params).filter(([k, v]) => defs.has(k) && v !== defs.get(k)))
}

// ---- Text linked to the numbers (Q 2026-10-18) ----
// Style effect text and signature combo text can say {key} (a number of that text's own group, e.g. {shatterPct}
// in the Cryomancer text), {GROUP.key} (any group, e.g. {MG.cap}) or {key|ord} for 1st / 2nd / 3rd / 4th.
// Extra values (e.g. hpStart / hpMax of the Champion) can be passed in. Unknown placeholders stay as typed.

const PLACEHOLDER = /\{(?:([A-Z]{2}(?::\d)?)\.)?([a-zA-Z]+)(\|ord)?\}/g

const fmt = (n: number) => String(Math.round(n * 100) / 100)
const ord = (n: number) => {
  const s = fmt(n)
  if (!Number.isInteger(n)) return s
  const t = n % 100
  return s + (t >= 11 && t <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th')
}

function lookup(t: Tuning, group: string, g: string | undefined, key: string, extra: Record<string, number>): number | undefined {
  if (!g && key in extra) return extra[key]
  const grp = (t as Record<string, Record<string, number>>)[g ?? group]
  return grp?.[key]
}

/** Text with its {placeholders} filled from the tuning (see above). */
export function fillText(text: string, group: string, t: Tuning = DEFAULT_TUNING, extra: Record<string, number> = {}): string {
  return (text ?? '').replace(PLACEHOLDER, (whole, g: string | undefined, key: string, o: string | undefined) => {
    const v = lookup(t, group, g, key, extra)
    return v === undefined ? whole : o ? ord(v) : fmt(v)
  })
}

/** Placeholders in the text that don't name a number (shown as an error in Admin). */
export function unknownPlaceholders(text: string, group: string, extraKeys: string[] = []): string[] {
  const extra = Object.fromEntries(extraKeys.map((k) => [k, 0]))
  return [...(text ?? '').matchAll(PLACEHOLDER)].filter((m) => lookup(DEFAULT_TUNING, group, m[1], m[2], extra) === undefined).map((m) => m[0])
}

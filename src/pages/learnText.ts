// Learnability helpers for the battle screen (playtest feedback #3, pack B): pure text, no React.
// - compactRules: effect_json → "when · gain · cost" lines for the card face (full text stays in the card sheet)
// - comboInfo / comboSteps: the signature combo pattern and which steps the Field already lights
import type { CardType } from '../engine'
import { COMBOS } from '../engine/combos'
import { describeAct, describeCond } from '../engine/effects/describe'
import { isDrawback, normalizeSpec, type ActSpec, type CondSpec, type EffectSpec, type Hook } from '../engine/effects/spec'
import type { Tuning } from '../engine/tuning'

export type CompactRule = { tag: string; when: string; gain: string[]; cost: string[] }

const TAG: Record<Hook, string> = { modify: 'BEFORE', onHit: 'ON HIT', onResolve: 'AFTER', onHeld: 'HOLD', onDraw: 'ON DRAW', onClean: 'AFTER', onBlocked: 'AFTER' }
const ACT = { strike: 'Strike', block: 'Block', charge: 'Charge' }
const ACTS = { strike: 'Strikes', block: 'Blocks', charge: 'Charges' }
const OP = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }
const STATUS_SHORT: Partial<Record<string, string>> = {
  noStrike: 'no Strike', noBlock: 'no Block', noCharge: 'no Charge', silence: 'Silenced', skillSilence: 'S effects off',
  trueDmg: 'True Dmg', guardBreak: 'Guard Crush', vulnerable: 'Vulnerable', deathMark: 'Marked', shield: 'Shield',
  parry: 'Parry', ignite: 'Ignite', chill: 'Chill', frozen: 'Frozen', subZero: 'Sub-Zero', frozenTomb: 'Frozen Tomb', venom: 'Venom',
}
const who = (w: 'self' | 'enemy') => (w === 'self' ? 'You' : 'Foe')
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
const turnsTag = (t: number) => (t <= 1 ? '' : ` ${t}t`)

/** One condition in a few words; anything without a short form falls back to the full sentence. */
export function shortCond(c: CondSpec): string {
  switch (c.c) {
    case 'selfAction': return `You ${ACT[c.a]}`
    case 'enemyAction': return `Foe ${ACTS[c.a]}`
    case 'hitResult': return c.r === 'clean' ? 'Clean hit' : 'Blocked'
    case 'enemyHandAtLeast': return `Foe ${c.n}+ cards`
    case 'enemyHandEmpty': return 'Foe Field empty'
    case 'handCompare': return { '<': 'Fewer cards than foe', '<=': 'No more cards than foe', '=': 'Same cards as foe', '>': 'More cards than foe' }[c.op]
    case 'enemyChainAtLeast': return `Foe chain ${c.n}+`
    case 'chainAll': return `All ${c.type}`
    case 'chainLength': return c.op === '=' ? `Chain = ${c.n}` : `Chain ${c.n}+`
    case 'slotIs': return `Slot ${c.n}`
    case 'hasFacing': return 'Facing card'
    case 'facingSameType': return 'Facing same type'
    case 'facingIs': return `Facing ${c.type}`
    case 'prevIs': return `After a ${c.type}`
    case 'tookDmg': return c.n <= 1 ? 'You got hit' : `You took ${c.n}+`
    case 'hpAtMost': return `HP ≤ ${c.n}`
    case 'hpNotAbove': return 'HP ≤ Foe'
    case 'hp': return `${c.who === 'self' ? 'HP' : 'Foe HP'} ${OP[c.op]} ${c.n}${c.pct ? '%' : ''}`
    case 'enteredWith': return `Came in with ${c.n}+`
    case 'silenced': return `${who(c.who)} Silenced`
    case 'hasStatus': return `${who(c.who)}: ${STATUS_SHORT[c.kind] ?? c.kind}`
    case 'res': return `${who(c.who)} ${c.n}+ res`
    case 'chainHas': return c.n <= 1 ? `${c.who === 'self' ? 'Chain' : 'Foe chain'} has ${c.type}` : `${c.who === 'self' ? 'Chain' : 'Foe chain'} ${c.n}+ ${c.type}`
    case 'fieldHas': return `${who(c.who)} ${c.n}+ ${c.type} on Field`
    case 'fieldAll': return `${c.who === 'self' ? 'Field' : 'Foe Field'} all ${c.type}`
    case 'ignite': return c.op === '<' ? `${who(c.who)} Ignite < ${c.n}` : `${who(c.who)} Ignite ${c.n}+`
    case 'chill': return c.op === '<' ? `${who(c.who)} Chill < ${c.n}` : `${who(c.who)} Chill ${c.n}+`
    default: return describeCond(c)
  }
}

const OWN: Record<string, string> = { this: '', next: ' next', following: ' later', chain: ' chain' }
const FOE: Record<string, string> = { facing: 'Facing', enemyAll: 'Foe' }
/** Whose card the dmg change lands on, as the line's head (foe) or tail (yours). */
function target(t: unknown, only?: CardType): { head: string; tail: string } {
  const o = only ? ` ${only}` : ''
  if (typeof t === 'object' && t) return 'enemySlot' in t ? { head: `Foe slot ${(t as { enemySlot: number }).enemySlot}${o} `, tail: '' } : { head: '', tail: ` slot ${(t as { slot: number }).slot}${o}` }
  if (FOE[t as string]) return { head: `${FOE[t as string]}${o}${t === 'enemyAll' ? ' cards' : ''} `, tail: '' }
  return { head: '', tail: `${OWN[t as string] ?? ''}${o}` }
}
const PER: Record<string, string> = {
  hitBlocked: 'blocked hit', chainCard: 'chain card', selfCard: 'card you hold', enemyCard: 'foe card', chainP: 'P', chainK: 'K', chainS: 'S',
  missingHp10: '10 missing HP', enemyIgnite: 'foe Ignite', enemyChill: 'foe Chill',
}
const per = (a: { per?: string }) => (a.per && PER[a.per] ? ` per ${PER[a.per]}` : '')

/** One action in a few words (res = the class resource name, e.g. Mana). */
export function shortAct(a: ActSpec, res = 'res'): string {
  switch (a.a) {
    case 'draw': return `${a.who === 'self' ? '' : a.who === 'enemy' ? 'Foe ' : 'Both '}Draw ${a.n}${per(a)}`
    case 'heal': return `${a.who === 'enemy' ? 'Foe ' : ''}+${a.n}${a.per === 'maxHpPct' ? '% Max HP' : a.per === 'missingHpPct' ? '% missing HP' : ' HP'}${per(a)}`
    case 'loseHp': return `${a.who === 'enemy' ? 'Foe ' : a.who === 'both' ? 'Both ' : ''}−${a.n} HP${per(a)}`
    case 'maxHp': return `${a.who === 'enemy' ? 'Foe ' : ''}Max HP ${signed(a.n)}`
    case 'status': {
      const t = a.turns === 0 ? '' : turnsTag(a.turns)
      const n = a.n ?? 1
      const head = a.who === 'enemy' ? 'Foe ' : a.who === 'both' ? 'Both ' : ''
      if (a.kind === 'blockPlus') return `${head}Block ${signed(n)}${t}`
      if (a.kind === 'shield' || a.kind === 'parry') return `${head}${STATUS_SHORT[a.kind]} ${n}${per(a)}${t}`
      if (a.kind === 'vulnerable') return `${a.who === 'self' ? 'You take' : `${head}takes`} +${n}% dmg${t}`
      return `${head}${STATUS_SHORT[a.kind] ?? a.kind}${t}`
    }
    case 'grow': return `${signed(a.n)} dmg ${a.dur === 'next' ? 'next hit' : 'for good'}`
    case 'addDmg': {
      const { head, tail } = target(a.target, a.onlyType)
      return `${head}${signed(a.n)} dmg${tail}${per(a)}`
    }
    case 'mulDmg': {
      const { head, tail } = target(a.target, a.onlyType)
      const x = a.pct === 0 ? '0 dmg' : a.pct < 100 ? `−${100 - a.pct}% dmg` : a.pct % 100 === 0 ? `×${a.pct / 100} dmg` : `${a.pct}% dmg`
      return `${head}${x}${tail}`
    }
    case 'blockNow': return `${a.who === 'enemy' ? 'Foe ' : ''}Block ${signed(a.n)}`
    case 'pierce': return `Pierce${OWN[a.target] ?? ''}`
    case 'steal': return 'Steal facing card'
    case 'cut': return a.which === 'facing' ? 'Cut facing card' : `Cut ${a.n} ${a.which}`
    case 'gainRes': return `${a.who === 'enemy' ? 'Foe ' : ''}${signed(a.n)} ${res}${per(a)}`
    case 'ignite': return a.n === 0 ? `${a.who === 'self' ? '' : 'Foe '}Ignite refresh` : `${a.who === 'self' ? '' : 'Foe '}Ignite ${a.n}${per(a)}`
    case 'chill': return `${a.who === 'self' ? '' : 'Foe '}Chill ${a.n}${per(a)}`
    case 'consumeIgnite': return a.burn ? 'Detonate Ignite' : 'Clear Ignite'
    case 'infuse': return `${a.who === 'self' ? 'You ' : a.who === 'both' ? 'Both ' : ''}⟡ Infuse ${a.n}`
    default: return describeAct(a)
  }
}

/** Bad for the card's owner: its own drawbacks, or a boost handed to the opponent. */
export function isCost(a: ActSpec): boolean {
  if (isDrawback(a)) return true
  if (a.a === 'status' && a.who === 'self' && a.kind === 'vulnerable') return true
  // your own card hitting for less
  const own = (t: unknown) => typeof t === 'string' && t in OWN
  if (a.a === 'addDmg' && own(a.target) && a.n < 0) return true
  if (a.a === 'mulDmg' && own(a.target) && a.pct < 100) return true
  if (!('who' in a) || a.who !== 'enemy') return false
  switch (a.a) {
    case 'draw':
    case 'heal': return a.n > 0
    case 'maxHp':
    case 'gainRes':
    case 'blockNow': return a.n > 0
    case 'status': return a.kind === 'shield' || a.kind === 'parry' || a.kind === 'trueDmg' || (a.kind === 'blockPlus' && (a.n ?? 1) > 0)
    default: return false
  }
}

/** Card-face version of effect_json: per rule, its timing tag, short conditions, and what you gain / pay. */
export function compactRules(spec: EffectSpec | null | undefined, res?: string): CompactRule[] {
  return normalizeSpec(spec ?? []).map((r) => {
    // "you play Strike" rides on the tag (BEFORE STRIKE) so the condition line stays short
    const mine = (r.if ?? []).find((c): c is Extract<CondSpec, { c: 'selfAction' }> => c.c === 'selfAction')
    const conds = (r.if ?? []).filter((c) => c !== mine).map(shortCond)
    if (r.once) conds.push('once')
    const tag = r.hook === 'onHeld' && r.at === 'before' ? 'HOLD·START' : TAG[r.hook]
    return {
      tag: mine ? `${tag} ${ACT[mine.a].toUpperCase()}` : tag,
      when: conds.join(' · '),
      gain: r.do.filter((a) => !isCost(a)).map((a) => shortAct(a, res)),
      cost: r.do.filter(isCost).map((a) => shortAct(a, res)),
    }
  })
}

// ---- Signature combo ----

export type ComboInfo = { name: string; pattern: CardType[]; need: string; reward: string }

/** The champion's signature combos as players read them, numbers from the tuning. */
export function comboInfo(championId: string, style: string | undefined, t: Tuning): ComboInfo[] {
  return (COMBOS[championId] ?? []).map((c) => {
    const base = { name: c.name, pattern: [...c.pattern] }
    switch (championId) {
      case 'TK': return { ...base, name: 'Second Helping', need: 'Foe Blocks one of them', reward: `Heal ${t.TK.comboHealPct}% of your HP` }
      case 'AS': return { ...base, name: 'Death Mark', need: 'All 3 hit clean', reward: `Mark: later Strikes burst +${t.AS.markBurstPct}%` }
      case 'MG':
        return style === 'MG:2'
          ? { ...base, name: 'Absolute Zero', need: 'All 3 hit clean', reward: `Foe Frozen + can't Block ${t.MG.comboNoBlockTurns}t` }
          : { ...base, name: 'Sealed', need: 'All 3 hit clean', reward: `Foe can't Block ${t.MG.comboNoBlockTurns}t` }
      case 'BR': return { ...base, name: 'Guard Crush', need: 'Nothing more, just Strike with them', reward: `Next Strike: ${t.BR.guardCrushBlockedPct}% through Block (${t.BR.guardCrushTurns}t)` }
      default: return { ...base, need: '', reward: '' }
    }
  })
}

/** Which pattern steps the cards already cover (any order, each card used once). */
export function comboSteps(pattern: CardType[], types: CardType[]): boolean[] {
  const left = [...types]
  return pattern.map((p) => {
    const i = left.indexOf(p)
    if (i < 0) return false
    left.splice(i, 1)
    return true
  })
}

// Learnability helpers for the battle screen (playtest feedback #3, pack B): pure text, no React.
// - compactRules: effect_json → timing, one line per condition, then gain / cost for the card face (full text stays in the card sheet)
// - comboInfo / comboSteps: the signature combo pattern and which steps the Field already lights
import type { CardType } from '../engine'
import { COMBOS } from '../engine/combos'
import { describeAct, describeCond } from '../engine/effects/describe'
import { isDrawback, normalizeSpec, type ActSpec, type CondSpec, type EffectSpec, type Hook } from '../engine/effects/spec'
import type { Tuning } from '../engine/tuning'
import { t as tr } from '../i18n'

export type CompactRule = { tag: string; when: string[]; gain: string[]; cost: string[] }

// Q 2026-10-28: a card works at only 3 timings; Hold and On hit are conditions on them
const TAG: Record<Hook, string> = { modify: 'Before action', onHit: 'After action', onResolve: 'After action', onHeld: 'After action', onDraw: 'When appear', onClean: 'After action', onBlocked: 'After action' }
const ACT = { strike: 'Strike', block: 'Block', charge: 'Charge' }
const OP = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }
/** Short status names on the card face; game words, so most stay English in Thai too (th.ts). */
export const STATUS_SHORT: Partial<Record<string, string>> = {
  noStrike: 'no Strike', noBlock: 'no Block', noCharge: 'no Charge', silence: 'Silenced', skillSilence: 'S effects off',
  trueDmg: 'True Dmg', guardBreak: 'Guard Crush', vulnerable: 'Vulnerable', deathMark: 'Marked', shield: 'Shield',
  parry: 'Parry', ignite: 'Ignite', chill: 'Chill', frozen: 'Frozen', subZero: 'Sub-Zero', frozenTomb: 'Frozen Tomb', thaw: 'Thaw', venom: 'Venom', woundUp: 'Wound Up', cutGuard: 'Cut guard', regen: 'Regen', empower: 'Empower',
}
const status = (k: string) => (STATUS_SHORT[k] ? tr(STATUS_SHORT[k]!) : k)
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
const turnsTag = (t: number) => (t <= 1 ? '' : tr(' ({n} turns)', { n: t }))
/** "Foe " / "Both " in front of a short line; yours has none */
const head = (w: string) => (w === 'enemy' ? tr('Foe {x}', { x: '' }) : w === 'both' ? tr('Both {x}', { x: '' }) : '')
const whoSays = (w: 'self' | 'enemy', x: string) => tr(w === 'self' ? 'You {x}' : 'Foe {x}', { x })

/** One condition in a few words; anything without a short form falls back to the full sentence. */
export function shortCond(c: CondSpec): string {
  switch (c.c) {
    case 'selfAction': return tr('You play {a}', { a: ACT[c.a] })
    case 'enemyAction': return tr('Foe plays {a}', { a: ACT[c.a] })
    case 'hitResult': return c.r === 'clean' ? tr('Clean hit') : tr('Blocked')
    case 'enemyHandAtLeast': return tr('Foe {n}+ cards', { n: c.n })
    case 'enemyHandEmpty': return tr('Foe Field empty')
    case 'handCompare': return { '<': tr('Fewer cards than foe'), '<=': tr('No more cards than foe'), '=': tr('Same cards as foe'), '>': tr('More cards than foe') }[c.op]
    case 'enemyChainAtLeast': return tr('Foe chain {n}+', { n: c.n })
    case 'chainAll': return tr('All {type}', { type: c.type })
    case 'chainLength': return c.op === '=' ? tr('Chain = {n}', { n: c.n }) : tr('Chain {n}+', { n: c.n })
    case 'slotIs': return tr('Slot {n}', { n: c.n })
    case 'hasFacing': return tr('Facing card')
    case 'noFacing': return tr('No facing card')
    case 'lostHp': return tr('Lost HP (this/last turn)')
    case 'facingSameType': return tr('Facing same type')
    case 'notHit': return tr('Not hit')
    case 'facingIs': return tr('Facing {type}', { type: c.type })
    case 'prevIs': return tr('After a {type}', { type: c.type })
    case 'tookDmg': return c.n <= 1 ? tr('You got hit') : tr('You took {n}+', { n: c.n })
    case 'hpAtMost': return tr('HP ≤ {n}', { n: c.n })
    case 'hpNotAbove': return tr('HP ≤ Foe')
    case 'hp': return tr(c.who === 'self' ? 'HP {op} {n}' : 'Foe HP {op} {n}', { op: OP[c.op], n: `${c.n}${c.pct ? '%' : ''}` })
    case 'enteredWith': return tr('Came in with {n}+', { n: c.n })
    case 'enteredAt': return tr('Drawn into slot {n}', { n: c.n })
    case 'hitBy': return c.n <= 1 ? tr('Hit by {type}', { type: c.type ?? tr('a card') }) : tr('Hit by {n}+ {type}', { n: c.n, type: c.type ?? tr('cards') })
    case 'blockedType': return c.n <= 1 ? tr('Blocked {type}', { type: c.type ?? tr('a hit') }) : tr('Blocked {n}+ {type}', { n: c.n, type: c.type ?? tr('hits') })
    case 'silenced': return whoSays(c.who, tr('Silenced'))
    case 'hasStatus': return tr(c.who === 'self' ? 'You: {status}' : 'Foe: {status}', { status: status(c.kind) })
    case 'res': return whoSays(c.who, tr('{n}+ res', { n: c.n }))
    case 'chainHas': return c.n <= 1 ? tr(c.who === 'self' ? 'Chain has {type}' : 'Foe chain has {type}', { type: c.type }) : tr(c.who === 'self' ? 'Chain {n}+ {type}' : 'Foe chain {n}+ {type}', { n: c.n, type: c.type })
    case 'fieldHas': return whoSays(c.who, tr('{n}+ {type} on Field', { n: c.n, type: c.type }))
    case 'fieldAll': return tr(c.who === 'self' ? 'Field all {type}' : 'Foe Field all {type}', { type: c.type })
    case 'ignite': return whoSays(c.who, c.op === '<' ? tr('Ignite < {n}', { n: c.n }) : tr('Ignite {n}+', { n: c.n }))
    case 'chill': return whoSays(c.who, c.op === '<' ? tr('Chill < {n}', { n: c.n }) : tr('Chill {n}+', { n: c.n }))
    default: return describeCond(c, tr)
  }
}

const OWN: Record<string, string> = { this: '', next: ' next', following: ' later', chain: ' chain' }
/** Whose card the dmg change lands on, as the line's head (foe) or tail (yours). */
function target(t: unknown, only?: CardType): { head: string; tail: string } {
  const o = only ? ` ${only}` : ''
  if (typeof t === 'object' && t) return 'enemySlot' in t ? { head: tr('Foe slot {n}{type} ', { n: (t as { enemySlot: number }).enemySlot, type: o }), tail: '' } : { head: '', tail: tr(' slot {n}{type}', { n: (t as { slot: number }).slot, type: o }) }
  if (t === 'facing') return { head: tr('Facing{type} ', { type: o }), tail: '' }
  if (t === 'enemyAll') return { head: tr('Foe{type} cards ', { type: o }), tail: '' }
  const own = OWN[t as string] ? tr(OWN[t as string]) : ''
  return { head: '', tail: `${own}${o}` }
}
export const PER: Record<string, string> = {
  hitBlocked: 'blocked hit', chainCard: 'chain card', selfCard: 'card you hold', enemyCard: 'foe card', chainP: 'P', chainK: 'K', chainS: 'S',
  missingHp10: '10 missing HP', missingHp5: '5 missing HP', enemyIgnite: 'foe Ignite', enemyChill: 'foe Chill', paidHp: 'HP paid',
}
const per = (a: { per?: string }) => (a.per && PER[a.per] ? tr(' per {what}', { what: tr(PER[a.per]) }) : '')

/** One action in a few words (res = the class resource name, e.g. Mana). */
export function shortAct(a: ActSpec, res = 'res'): string {
  const h = 'who' in a ? head(a.who) : ''
  switch (a.a) {
    case 'draw': return `${h}${tr('Draw {n}', { n: a.n })}${per(a)}`
    // Q 2026-10-28: "+2% Max HP" read as Max HP growing; it's a heal of 2% of Max HP
    case 'heal': return `${a.who === 'enemy' ? head('enemy') : ''}${a.per === 'maxHpPct' ? tr('Heal {n}% Max HP', { n: a.n }) : a.per === 'missingHpPct' ? tr('Heal {n}% missing HP', { n: a.n }) : tr('Heal {n}', { n: a.n })}${a.per === 'maxHpPct' || a.per === 'missingHpPct' ? '' : per(a)}`
    case 'loseHp': return `${h}${tr('−{n} HP', { n: a.n })}${per(a)}`
    case 'maxHp': return `${a.who === 'enemy' ? head('enemy') : ''}${tr('Max HP {n}', { n: signed(a.n) })}`
    case 'status': {
      const t = a.turns === 0 || a.turns > 50 ? '' : turnsTag(a.turns)
      const n = a.n ?? 1
      if (a.kind === 'noStrike' || a.kind === 'noBlock' || a.kind === 'noCharge') {
        const act = { noStrike: 'Strike', noBlock: 'Block', noCharge: 'Charge' }[a.kind]
        return `${tr(a.who === 'self' ? "You can't {a}" : a.who === 'both' ? "Both can't {a}" : "Foe can't {a}", { a: act })}${t}`
      }
      if (a.kind === 'blockPlus') return `${h}${tr('Block {n}', { n: signed(n) })}${t}`
      if (a.kind === 'shield' || a.kind === 'parry') return `${h}${status(a.kind)} ${n}${per(a)}${t}`
      if (a.kind === 'vulnerable') return `${a.who === 'self' ? tr('You take +{n}% dmg', { n }) : `${h}${tr('takes +{n}% dmg', { n })}`}${t}`
      if (a.kind === 'regen') return `${h}${tr('Regen {n}% missing HP', { n })}${t}`
      if (a.kind === 'empower') return `${h}${tr('Next Strike +{n} dmg/card', { n })}`
      return `${h}${status(a.kind)}${t}`
    }
    case 'grow': return a.dur === 'next' ? tr('{n} dmg next hit', { n: signed(a.n) }) : tr('{n} dmg for good', { n: signed(a.n) })
    case 'addDmg': {
      const { head: hd, tail } = target(a.target, a.onlyType)
      return `${hd}${tr('{n} dmg', { n: signed(a.n) })}${tail}${per(a)}${a.max != null ? tr(' (max {n})', { n: a.max }) : ''}`
    }
    case 'mulDmg': {
      const { head: hd, tail } = target(a.target, a.onlyType)
      const x = a.pct === 0 ? tr('0 dmg') : a.pct < 100 ? tr('−{n}% dmg', { n: 100 - a.pct }) : a.pct % 100 === 0 ? tr('×{n} dmg', { n: a.pct / 100 }) : tr('{n}% dmg', { n: a.pct })
      return `${hd}${x}${tail}`
    }
    case 'blockNow': return `${a.who === 'enemy' ? head('enemy') : ''}${tr('Block {n}', { n: signed(a.n) })}`
    case 'pierce': return `${a.parry ? tr('Pierce + Parry') : tr('Pierce')}${OWN[a.target] ? tr(OWN[a.target]) : ''}`
    case 'shatter': return tr('Shatter Shield/Parry, +{n} dmg each', { n: a.n })
    case 'steal': return tr('Steal facing card')
    case 'cut': return a.which === 'facing' ? tr('Cut facing card') : tr(a.which === 'oldest' ? 'Cut {n} oldest' : 'Cut {n} newest', { n: a.n })
    case 'gainRes': return `${a.who === 'enemy' ? head('enemy') : ''}${signed(a.n)} ${tr(res)}${per(a)}`
    case 'ignite': return `${a.who === 'self' ? '' : head('enemy')}${a.n === 0 ? tr('Ignite refresh') : tr('Ignite {n}', { n: a.n })}${a.n === 0 ? '' : per(a)}`
    case 'chill': return `${a.who === 'self' ? '' : head('enemy')}${tr('Chill {n}', { n: a.n })}${per(a)}`
    case 'consumeIgnite': return a.burn ? tr('Detonate Ignite') : tr('Clear Ignite')
    case 'infuse': return `${a.who === 'self' ? tr('You {x}', { x: '' }) : a.who === 'both' ? head('both') : ''}⟡ Infuse ${a.n}`
    default: return describeAct(a, false, tr)
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

/** Card-face version of effect_json: per rule, its timing, one short line per condition, and what you gain / pay. */
export function compactRules(spec: EffectSpec | null | undefined, res?: string): CompactRule[] {
  return normalizeSpec(spec ?? []).map((r) => {
    const conds = (r.if ?? []).map(shortCond)
    const mine = (r.if ?? []).find((c): c is Extract<CondSpec, { c: 'selfAction' }> => c.c === 'selfAction')
    // On hit fires right after this card's own hit, so only when you Strike
    if (r.hook === 'onHit' && !mine) conds.unshift(tr('You play {a}', { a: ACT.strike }))
    // Hold = the card stays on the Field, i.e. you didn't Strike; playing Block or Charge already says so
    if (r.hook === 'onHeld' && !mine) conds.unshift(tr("You don't Strike"))
    if (r.once) conds.push(tr('Once per game'))
    return {
      tag: tr(r.hook === 'onHeld' && r.at === 'before' ? TAG.modify : TAG[r.hook]),
      when: conds,
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
      case 'TK': return { ...base, name: 'Second Helping', need: tr('Foe Blocks one of them'), reward: tr('Heal {n}% of your HP', { n: t.TK.comboHealPct }) }
      case 'AS': return { ...base, name: 'Death Mark', need: tr('All 3 hit clean'), reward: tr('Mark: later Strikes burst +{n}%', { n: t.AS.markBurstPct }) }
      case 'MG':
        return style === 'MG:2'
          ? { ...base, name: 'Absolute Zero', need: tr('All 3 hit clean'), reward: tr("Foe Frozen + can't Block {n}t", { n: t.MG.comboNoBlockTurns }) }
          : { ...base, name: 'Sealed', need: tr('All 3 hit clean'), reward: tr("Foe can't Block {n}t", { n: t.MG.comboNoBlockTurns }) }
      case 'BR': return { ...base, name: 'Guard Crush', need: tr('Nothing more, just Strike with them'), reward: tr('Next Strike: {pct}% through Block ({n}t)', { pct: t.BR.guardCrushBlockedPct, n: t.BR.guardCrushTurns }) }
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

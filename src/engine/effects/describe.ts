// effect_json → short text (used by the Admin form in English, and as the card's effect text on the battle screen).
// Every line goes through tr, so the battle screen can pass the player's language (i18n t); the default fills the English.
import type { ActSpec, CondSpec, EffectSpec, Hook } from './spec'
import { normalizeSpec } from './spec'
import type { DmgTarget, Per, Who } from './primitives'

/** Translator: English line with {slots} → the line in the player's language, slots filled from vars. */
export type Tr = (en: string, vars?: Record<string, string | number>) => string
/** The English line with its {slots} filled (Admin, tests). */
export const EN: Tr = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s)

export const HOOK_LABEL: Record<Hook, string> = {
  modify: 'Before action',
  onHit: 'On hit',
  onResolve: 'After action',
  onHeld: 'Every turn (Hold)',
  onDraw: 'Comes into play',
  onClean: 'After action (clean hit)',
  onBlocked: 'After action (blocked)',
}
export const WHO: Record<Who, string> = { self: 'you', enemy: 'opponent', both: 'both players' }
const ACTION = { strike: 'Strike', block: 'Block', charge: 'Charge' }
export const TYPE = { P: 'Punch', K: 'Kick', S: 'Skill' }
export const STATUS = { noStrike: "can't Strike", noBlock: "can't Block", noCharge: "can't Charge", blockPlus: 'Block stops ± hits', trueDmg: 'True Damage', guardBreak: 'Guard Crush', silence: 'Silenced (card effects off)', shield: 'Shield', parry: 'Parry', vulnerable: 'Vulnerable', deathMark: 'Mark of Assassin', ignite: 'Ignite', chill: 'Chill', frozen: 'Frozen', skillSilence: 'Skill effects off', subZero: 'Sub-Zero (each clean hit next Strike gives 1 Chill)', frozenTomb: 'Frozen Tomb', thaw: 'Thaw (can\'t be Frozen)', venom: 'Venom', woundUp: 'Wound Up', cutGuard: "Cut guard (can't be Cut)", regen: 'Regen', empower: 'Empower' }
export const PER_LABEL: Record<Per, string> = {
  hitBlocked: 'hit you blocked this turn',
  chainCard: 'card in your chain',
  selfCard: 'card in your hand',
  enemyCard: "card in opponent's hand",
  chainP: 'Punch in your chain',
  chainK: 'Kick in your chain',
  chainS: 'Skill in your chain',
  missingHp10: '10 HP you are missing',
  missingHp5: '5 HP you are missing',
  maxHpPct: '1% of your Max HP',
  missingHpPct: '1% of your missing HP',
  enemyIgnite: 'Ignite stack on opponent',
  enemyChill: 'Chill stack on opponent',
  paidHp: 'HP this card cost',
}
/** heal / Shield as a % of HP read better as "5% of your Max HP" than "5 HP per 1% of your Max HP" */
export const PCT_OF: Partial<Record<Per, string>> = { maxHpPct: 'your Max HP', missingHpPct: 'your missing HP' }
export const DMG_TARGET = { this: 'this card', next: 'next card', following: 'all following cards', chain: 'every card in your chain', facing: 'facing card', enemyAll: "all opponent's cards" }
export const PIERCE_TARGET = { this: 'this card', next: 'next card', following: 'all following cards', chain: 'your whole chain' }
const OP = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
const per = (tr: Tr, p?: Per) => (p ? tr(' per {what}', { what: tr(PER_LABEL[p]) }) : '')
const type = (tr: Tr, t: keyof typeof TYPE) => tr(TYPE[t])

/** "you have no Chill", "opponent has 2+ Ignite stacks" */
function stacksCond(tr: Tr, c: { who: 'self' | 'enemy'; op: '>=' | '<'; n: number }, el: string): string {
  const v = { n: c.n, el }
  const self = c.who === 'self'
  if (c.op === '<' && c.n <= 1) return tr(self ? 'you have no {el}' : 'opponent has no {el}', v)
  if (c.op === '<') return tr(self ? 'you have fewer than {n} {el} stacks' : 'opponent has fewer than {n} {el} stacks', v)
  if (c.n === 1) return tr(self ? 'you have {n}+ {el} stack' : 'opponent has {n}+ {el} stack', v)
  return tr(self ? 'you have {n}+ {el} stacks' : 'opponent has {n}+ {el} stacks', v)
}

/** res = the class resource's name (Mana, Rage, Energy), when the reader knows it. */
export function describeCond(c: CondSpec, tr: Tr = EN, res = 'resource'): string {
  const self = 'who' in c && c.who === 'self'
  switch (c.c) {
    case 'enemyHandAtLeast': return tr('opponent has {n}+ cards', { n: c.n })
    case 'enemyHandEmpty': return tr("opponent's hand is empty")
    case 'handCompare': return { '<': tr('you have fewer cards than opponent'), '<=': tr("you don't have more cards than opponent"), '=': tr('you have as many cards as opponent'), '>': tr('you have more cards than opponent') }[c.op]
    case 'enemyAction': return tr('opponent plays {a}', { a: ACTION[c.a] })
    case 'selfAction': return tr('you play {a}', { a: ACTION[c.a] })
    case 'hitResult': return c.r === 'clean' ? tr('this card hits clean') : tr('this card is blocked')
    case 'enemyChainAtLeast': return tr('opponent Strikes with {n}+ cards', { n: c.n })
    case 'chainAll': return tr('your chain is all {type}', { type: type(tr, c.type) })
    case 'chainLength': return c.op === '=' ? tr(c.n === 1 ? 'your chain has {n} card' : 'your chain has {n} cards', { n: c.n }) : tr('your chain has {n}+ cards', { n: c.n })
    case 'slotIs': return tr('this card is in slot {n}', { n: c.n })
    case 'hasFacing': return tr('there is a facing card')
    case 'noFacing': return tr('there is no facing card')
    case 'lostHp': return tr('you lost HP this turn or last turn')
    case 'facingSameType': return tr('facing card is the same type')
    case 'tookDmg': return c.n <= 1 ? tr('you take dmg from a hit this turn') : tr('you take {n}+ dmg from hits this turn', { n: c.n })
    case 'hpAtMost': return tr('your HP ≤ {n}', { n: c.n })
    case 'hpNotAbove': return tr("your HP ≤ opponent's HP")
    case 'hp': return tr(self ? 'your HP {op} {n}' : "opponent's HP {op} {n}", { op: OP[c.op], n: `${c.n}${c.pct ? '%' : ''}` })
    case 'enteredWith': return tr('you had {n}+ cards (this one included) when this card came into play', { n: c.n })
    case 'silenced': return self ? tr('you are Silenced') : tr('opponent is Silenced')
    case 'hasStatus': return tr(self ? 'you have {status}' : 'opponent has {status}', { status: tr(STATUS[c.kind]) })
    case 'res': return tr(self ? 'you have {n}+ {res}' : 'opponent has {n}+ {res}', { n: c.n, res: tr(res) })
    case 'chainHas': return tr(self ? 'your chain has {n}+ {type}' : "opponent's chain has {n}+ {type}", { n: c.n, type: type(tr, c.type) })
    case 'prevIs': return tr('the card before this one is a {type}', { type: type(tr, c.type) })
    case 'enteredAt': return tr('this card was drawn into slot {n}', { n: c.n })
    case 'hitBy': return tr(c.n === 1 ? "you've been hit by a {type} this turn" : "you've been hit by {n}+ {type}s this turn", { n: c.n, type: c.type ? type(tr, c.type) : tr('card') })
    case 'blockedType': return tr(c.n === 1 ? 'you Blocked a {type} this turn' : 'you Blocked {n}+ {type}s this turn', { n: c.n, type: c.type ? type(tr, c.type) : tr('hit') })
    case 'notHit': return tr("you weren't hit this turn")
    case 'facingIs': return tr('facing card is a {type}', { type: type(tr, c.type) })
    case 'fieldHas': return tr(self ? 'you have {n}+ {type} on the Field' : 'opponent has {n}+ {type} on the Field', { n: c.n, type: type(tr, c.type) })
    case 'fieldAll': return tr(self ? 'your Field is all {type}' : "opponent's Field is all {type}", { type: type(tr, c.type) })
    case 'chill': return stacksCond(tr, c, 'Chill')
    case 'ignite': return stacksCond(tr, c, 'Ignite')
    default: return tr('(unknown condition)')
  }
}

function describeTarget(t: DmgTarget, tr: Tr): string {
  if (typeof t === 'object') return 'enemySlot' in t ? tr("opponent's card in slot {n}", { n: t.enemySlot }) : tr('card in slot {n}', { n: t.slot })
  return tr(DMG_TARGET[t])
}

/** Which cards a dmg change lands on: "all following cards (Kick only)", "all opponent's Kick cards". */
function dmgWhat(a: Extract<ActSpec, { a: 'addDmg' | 'mulDmg' }>, tr: Tr): string {
  if (a.target === 'enemyAll' && a.onlyType) return tr("all opponent's {type} cards", { type: type(tr, a.onlyType) })
  const what = describeTarget(a.target, tr)
  return a.onlyType ? tr('{what} ({type} only)', { what, type: type(tr, a.onlyType) }) : what
}

/** now = the rule fires before the attack, so 1-turn statuses land this turn */
export function describeAct(a: ActSpec, now = false, tr: Tr = EN, res = 'resource'): string {
  const self = 'who' in a && a.who === 'self'
  const who = 'who' in a ? tr(WHO[a.who]) : ''
  switch (a.a) {
    case 'draw': return tr(self ? 'draw {n}' : '{who} draw {n}', { n: a.n, who }) + per(tr, a.per)
    case 'heal': {
      const of = a.per && PCT_OF[a.per]
      if (of) return tr(self ? 'gain {n}% of {of} as HP' : '{who} gain {n}% of {of} as HP', { n: a.n, of: tr(of), who })
      return tr(self ? 'gain {n} HP' : '{who} gain {n} HP', { n: a.n, who }) + per(tr, a.per)
    }
    case 'loseHp': return tr(self ? 'lose {n} HP' : '{who} lose {n} HP', { n: a.n, who }) + per(tr, a.per)
    case 'maxHp': return tr(self ? 'Max HP {n}' : '{who} Max HP {n}', { n: signed(a.n), who })
    case 'status': {
      // turns 0 = this turn only (Shield gained before the attack, gone at end of turn)
      const turnsEn = a.turns === 0 ? 'this turn only' : a.turns === 1 ? (now ? 'this turn' : 'next turn') : 'for {n} turns'
      const turns = tr(turnsEn, { n: a.turns })
      const n = a.n ?? 1
      if (a.kind === 'blockPlus') return tr(self ? 'your Block stops {n} {hits} {turns}' : "{who}'s Block stops {n} {hits} {turns}", { n: signed(n), hits: tr(Math.abs(n) === 1 ? 'hit' : 'hits'), turns, who })
      if (a.kind === 'shield') {
        // a Shield gained now lasts this turn; one gained after the attack lasts through next turn
        const lasts = turnsEn === 'next turn' ? tr('through next turn') : turns
        return tr(self ? 'gain Shield {n}{per} (absorbs hit dmg, lasts {lasts})' : '{who} gains Shield {n}{per} (absorbs hit dmg, lasts {lasts})', { n, per: per(tr, a.per), lasts, who })
      }
      if (a.kind === 'parry') return tr(self ? 'gain Parry {n} {turns} (the first {n} {hits} past Block are parried: 0 dmg)' : '{who} gains Parry {n} {turns} (the first {n} {hits} past Block are parried: 0 dmg)', { n, turns, hits: tr(n === 1 ? 'hit' : 'hits'), who })
      if (a.kind === 'regen') return tr(self ? 'you regain {n}% of missing HP at the end of every turn, {t} {turnWord}' : '{who} regains {n}% of missing HP at the end of every turn, {t} {turnWord}', { n, t: a.turns, turnWord: tr(a.turns === 1 ? 'turn' : 'turns'), who })
      if (a.kind === 'empower') return tr(self ? 'your next Strike: every chain card +{n} dmg' : "{who}'s next Strike: every chain card +{n} dmg", { n, who })
      if (a.kind === 'vulnerable') return tr(self ? 'you take {n}% more dmg from hits {turns}' : '{who} takes {n}% more dmg from hits {turns}', { n, turns, who })
      return tr('{who} {status} {turns}', { who, status: tr(STATUS[a.kind]), turns })
    }
    case 'grow': return tr(a.dur === 'next' ? 'this card gains {n} dmg on its next attack' : 'this card gains {n} dmg for the rest of the game', { n: signed(a.n) }) + (a.stack ? tr(' (stacks)') : '')
    case 'addDmg': return tr('{what} {n} dmg', { what: dmgWhat(a, tr), n: signed(a.n) }) + per(tr, a.per) + (a.max != null ? tr(' (max {n})', { n: signed(a.max) }) : '')
    case 'blockNow': {
      const n = Math.abs(a.n)
      const v = { n, who, hits: tr(n === 1 ? 'hit' : 'hits') }
      if (a.n >= 0) return tr(self ? 'your Block stops {n} more {hits} this turn' : "{who}'s Block stops {n} more {hits} this turn", v)
      return tr(self ? 'your Block stops {n} fewer {hits} this turn' : "{who}'s Block stops {n} fewer {hits} this turn", v)
    }
    case 'pierce': {
      const what = tr(PIERCE_TARGET[a.target])
      const one = a.target === 'this' || a.target === 'next'
      if (a.parry) return tr(one ? '{what} ignores Block and Parry' : '{what} ignore Block and Parry', { what })
      return tr(one ? '{what} ignores Block' : '{what} ignore Block', { what })
    }
    case 'shatter': return tr("remove the opponent's Shield and Parry first, this card +{n} dmg per one removed", { n: a.n })
    case 'steal': return tr("steal the opponent's card in this slot onto your Field")
    case 'cut': {
      if (a.which === 'facing') return tr('opponent discards their card in this slot from the Field to the bottom of their deck (Cut)')
      const which = tr(a.which)
      return tr(a.n === 1 ? 'opponent discards their {which} card from the Field to the bottom of their deck (Cut)' : 'opponent discards their {n} {which} cards from the Field to the bottom of their deck (Cut)', { n: a.n, which })
    }
    // a negative gain is a payment (BR-029 "Pay 5 Rage" read "Gain -5 resource")
    case 'gainRes': return (a.n < 0 ? tr(self ? 'lose {n} {res}' : '{who} lose {n} {res}', { n: -a.n, who, res: tr(res) }) : tr(self ? 'gain {n} {res}' : '{who} gain {n} {res}', { n: a.n, who, res: tr(res) })) + per(tr, a.per)
    case 'ignite':
      if (a.n === 0) return tr("{who}'s Ignite starts its 3 turns again", { who })
      return tr(self ? '{who} gain {n} Ignite{per} (each stack burns 2 HP + 0.5% Max HP every turn and cuts heals 10%, 3 turns, max 4)' : '{who} gains {n} Ignite{per} (each stack burns 2 HP + 0.5% Max HP every turn and cuts heals 10%, 3 turns, max 4)', { n: a.n, who, per: per(tr, a.per) })
    case 'chill': return tr(self ? "{who} gain {n} Chill{per} (each stack: hits deal 10% less, 3 turns; at 4 stacks Frozen: loses 15% Max HP and can't Strike next turn)" : "{who} gains {n} Chill{per} (each stack: hits deal 10% less, 3 turns; at 4 stacks Frozen: loses 15% Max HP and can't Strike next turn)", { n: a.n, who, per: per(tr, a.per) })
    case 'infuse': return a.who === 'enemy' ? tr('⟡ Infuse {n} (Pyromancer: {n} Ignite · Cryomancer: {n} Chill)', { n: a.n }) : tr('⟡ Infuse {n} on {who} (Pyromancer: {n} Ignite · Cryomancer: {n} Chill)', { n: a.n, who })
    case 'consumeIgnite': return a.burn ? tr("{who}'s Ignite explodes: all its remaining burn dmg at once", { who }) : tr("clear {who}'s Ignite", { who })
    case 'mulDmg': {
      const what = dmgWhat(a, tr)
      if (a.pct === 0) return tr('{what} deal 0 dmg', { what })
      if (a.pct < 100) return tr('{what} lose {n}% dmg', { what, n: 100 - a.pct })
      return a.pct % 100 === 0 ? tr('{what} dmg x{n}', { what, n: a.pct / 100 }) : tr('{what} dmg {n}%', { what, n: a.pct })
    }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function describeSpec(spec: EffectSpec | null | undefined, tr: Tr = EN, res = 'resource'): string {
  return normalizeSpec(spec ?? [])
    .map((r) => {
      const conds = (r.if ?? []).map((c) => describeCond(c, tr, res))
      const hook = tr(HOOK_LABEL[r.hook])
      const when = r.hook === 'onHeld' && r.at === 'before' ? tr('{hook}, start of turn', { hook }) : hook
      const head = [when, conds.length ? tr('if {conds}', { conds: conds.join(tr(' and ')) }) : ''].filter(Boolean).join(', ')
      // a Parry gained Before action guards this turn's hits (statuses tick before the chain); everything else gained
      // then is read from next turn on, like one gained after the attack
      const now = (a: ActSpec) => r.at === 'before' || (r.hook === 'modify' && a.a === 'status' && a.kind === 'parry')
      return `${head}: ${cap(r.do.map((a) => describeAct(a, now(a), tr, res)).join(', '))}${r.once ? tr(' (once per game)') : ''}`
    })
    .join(' / ')
}

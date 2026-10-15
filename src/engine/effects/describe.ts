// effect_json → short English text (used by the Admin form, and as the card's effect text)
import type { ActSpec, CondSpec, EffectSpec, Hook } from './spec'
import { normalizeSpec } from './spec'
import type { DmgTarget, Per, Who } from './primitives'

export const HOOK_LABEL: Record<Hook, string> = {
  modify: 'Before action',
  onResolve: 'After action',
  onHeld: 'Every turn (Hold)',
  onDraw: 'Comes into play',
  onClean: 'After action (clean hit)',
  onBlocked: 'After action (blocked)',
}
const WHO: Record<Who, string> = { self: 'you', enemy: 'opponent', both: 'both players' }
const ACTION = { strike: 'Strike', block: 'Block', charge: 'Charge' }
const TYPE = { P: 'Punch', K: 'Kick', S: 'Skill' }
const STATUS = { noStrike: "can't Strike", noBlock: "can't Block", noCharge: "can't Charge", blockPlus: 'Block stops ± hits', trueDmg: 'True Damage', guardBreak: 'Guard Break' }
export const PER_LABEL: Record<Per, string> = {
  hitBlocked: 'hit you blocked this turn',
  chainCard: 'card in your chain',
  selfCard: 'card in your hand',
  enemyCard: "card in opponent's hand",
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
const cards = (n: number) => `${n} card${n === 1 ? '' : 's'}`

export function describeCond(c: CondSpec): string {
  switch (c.c) {
    case 'enemyHandAtLeast': return `opponent has ${c.n}+ cards`
    case 'enemyHandEmpty': return "opponent's hand is empty"
    case 'handCompare': return { '<': 'you have fewer cards than opponent', '=': 'you have as many cards as opponent', '>': 'you have more cards than opponent' }[c.op]
    case 'enemyAction': return `opponent plays ${ACTION[c.a]}`
    case 'selfAction': return `you play ${ACTION[c.a]}`
    case 'hitResult': return c.r === 'clean' ? 'this card hits clean' : 'this card is blocked'
    case 'enemyChainAtLeast': return `opponent Strikes with ${c.n}+ cards`
    case 'chainAll': return `your chain is all ${TYPE[c.type]}`
    case 'chainLength': return c.op === '=' ? `your chain has ${cards(c.n)}` : `your chain has ${c.n}+ cards`
    case 'slotIs': return `this card is in slot ${c.n}`
    case 'hasFacing': return 'there is a facing card'
    case 'facingSameType': return 'facing card is the same type'
    case 'tookDmg': return c.n <= 1 ? 'you take dmg from a hit this turn' : `you take ${c.n}+ dmg from hits this turn`
    case 'hpAtMost': return `your HP ≤ ${c.n}`
    case 'hpNotAbove': return "your HP ≤ opponent's HP"
    case 'hp': return `${c.who === 'self' ? 'your' : "opponent's"} HP ${{ '<': '<', '<=': '≤', '>': '>', '>=': '≥' }[c.op]} ${c.n}${c.pct ? '%' : ''}`
    case 'enteredWith': return `you had ${c.n}+ cards (this one included) when this card came into play`
  }
}

function describeTarget(t: DmgTarget): string {
  if (typeof t === 'object') return 'enemySlot' in t ? `opponent's card in slot ${t.enemySlot}` : `card in slot ${t.slot}`
  return { this: 'this card', next: 'next card', following: 'all following cards', facing: 'facing card', enemyAll: "all opponent's cards" }[t]
}

/** now = the rule fires before the attack, so 1-turn statuses land this turn */
export function describeAct(a: ActSpec, now = false): string {
  switch (a.a) {
    case 'draw': return (a.who === 'self' ? `draw ${a.n}` : `${WHO[a.who]} draw ${a.n}`) + per(a.per)
    case 'heal': return (a.who === 'self' ? `gain ${a.n} HP` : `${WHO[a.who]} gain ${a.n} HP`) + per(a.per)
    case 'loseHp': return (a.who === 'self' ? `lose ${a.n} HP` : `${WHO[a.who]} lose ${a.n} HP`) + per(a.per)
    case 'maxHp': return `${a.who === 'self' ? '' : `${WHO[a.who]} `}Max HP ${signed(a.n)}`
    case 'status': {
      const turns = a.turns === 1 ? (now ? 'this turn' : 'next turn') : `for ${a.turns} turns`
      if (a.kind === 'blockPlus') {
        const n = a.n ?? 1
        return `${a.who === 'self' ? 'your' : `${WHO[a.who]}'s`} Block stops ${signed(n)} hit${Math.abs(n) === 1 ? '' : 's'} ${turns}`
      }
      return `${WHO[a.who]} ${STATUS[a.kind]} ${turns}`
    }
    case 'grow': return `this card gains ${signed(a.n)} dmg ${a.dur === 'next' ? 'on its next attack' : 'for the rest of the game'}${a.stack ? ' (stacks)' : ''}`
    case 'addDmg': return `${describeTarget(a.target)}${a.onlyType ? ` (${TYPE[a.onlyType]} only)` : ''} ${signed(a.n)} dmg`
    case 'blockNow': {
      const n = Math.abs(a.n)
      return `${a.who === 'self' ? 'your' : `${WHO[a.who]}'s`} Block stops ${n} ${a.n >= 0 ? 'more' : 'fewer'} hit${n === 1 ? '' : 's'} this turn`
    }
    case 'mulDmg': {
      const what = a.target === 'enemyAll' && a.onlyType ? `all opponent's ${TYPE[a.onlyType]} cards` : `${describeTarget(a.target)}${a.onlyType ? ` (${TYPE[a.onlyType]} only)` : ''}`
      if (a.pct < 100) return `${what} lose ${100 - a.pct}% dmg`
      return a.pct % 100 === 0 ? `${what} dmg x${a.pct / 100}` : `${what} dmg ${a.pct}%`
    }
  }
}

const per = (p?: Per) => (p ? ` per ${PER_LABEL[p]}` : '')

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function describeSpec(spec: EffectSpec | null | undefined): string {
  return normalizeSpec(spec ?? [])
    .map((r) => {
      const conds = (r.if ?? []).map(describeCond)
      const when = r.hook === 'onHeld' && r.at === 'before' ? `${HOOK_LABEL[r.hook]}, start of turn` : HOOK_LABEL[r.hook]
      const head = [when, conds.length ? `if ${conds.join(' and ')}` : ''].filter(Boolean).join(', ')
      return `${head}: ${cap(r.do.map((a) => describeAct(a, r.at === 'before')).join(', '))}${r.once ? ' (once per game)' : ''}`
    })
    .join(' / ')
}

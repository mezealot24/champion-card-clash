// effect_json → short English text (used by the Admin form, and as the card's effect text)
import type { ActSpec, CondSpec, EffectSpec, Hook } from './spec'
import { normalizeSpec } from './spec'
import type { DmgTarget, Who } from './primitives'

export const HOOK_LABEL: Record<Hook, string> = {
  modify: 'Before attack',
  onResolve: 'After attack',
  onHeld: 'Every turn (Hold)',
  onDraw: 'Comes into play',
  onClean: 'After attack (clean)',
  onBlocked: 'After attack (blocked)',
}
const WHO: Record<Who, string> = { self: 'you', enemy: 'opponent', both: 'both players' }
const ACTION = { strike: 'Strike', block: 'Block', charge: 'Charge' }
const TYPE = { P: 'Punch', K: 'Kick', S: 'Skill' }
const STATUS = { noStrike: "can't Strike", noBlock: "can't Block", noCharge: "can't Charge" }

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
    case 'hpAtMost': return `your HP ≤ ${c.n}`
    case 'hpNotAbove': return "your HP ≤ opponent's HP"
  }
}

function describeTarget(t: DmgTarget): string {
  if (typeof t === 'object') return `card in slot ${t.slot}`
  return { this: 'this card', next: 'next card', following: 'all following cards', facing: 'facing card' }[t]
}

export function describeAct(a: ActSpec): string {
  switch (a.a) {
    case 'draw': return a.who === 'self' ? `draw ${a.n}` : `${WHO[a.who]} draw ${a.n}`
    case 'heal': return a.who === 'self' ? `gain ${a.n} HP` : `${WHO[a.who]} gain ${a.n} HP`
    case 'loseHp': return a.who === 'self' ? `lose ${a.n} HP` : `${WHO[a.who]} lose ${a.n} HP`
    case 'maxHp': return `${a.who === 'self' ? '' : `${WHO[a.who]} `}Max HP ${signed(a.n)}`
    case 'status': return `${WHO[a.who]} ${STATUS[a.kind]} for ${a.turns} turn${a.turns === 1 ? '' : 's'}`
    case 'grow': return `this card gains ${signed(a.n)} dmg ${a.dur === 'next' ? 'on its next attack' : 'for the rest of the game'}`
    case 'addDmg': return `${describeTarget(a.target)}${a.onlyType ? ` (${TYPE[a.onlyType]} only)` : ''} ${signed(a.n)} dmg`
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function describeSpec(spec: EffectSpec | null | undefined): string {
  return normalizeSpec(spec ?? [])
    .map((r) => {
      const conds = (r.if ?? []).map(describeCond)
      const head = [HOOK_LABEL[r.hook], conds.length ? `if ${conds.join(' and ')}` : ''].filter(Boolean).join(', ')
      return `${head}: ${cap(r.do.map(describeAct).join(', '))}`
    })
    .join(' / ')
}

// Effect as data (cards.effect_json): what the Admin form saves and the engine compiles.
// Same vocabulary as primitives.ts, so every rule here is one primitive call.
import type { CardType, StatusKind } from '../types'
import * as P from './primitives'
import type { Act, CardEffect, ChainCtx, Cond } from './types'

/**
 * Timings, Tekken Card Tournament style: modify = Before attack, onResolve = After attack,
 * onHeld = Every turn (Hold), onDraw = Comes into play.
 * onClean / onBlocked are legacy: normalizeSpec turns them into onResolve + a hitResult condition.
 */
export type Hook = 'modify' | 'onResolve' | 'onHeld' | 'onDraw' | 'onClean' | 'onBlocked'
export const HOOKS: Hook[] = ['modify', 'onResolve', 'onHeld', 'onDraw']

export type CondSpec =
  | { c: 'enemyHandAtLeast'; n: number }
  | { c: 'enemyHandEmpty' }
  | { c: 'handCompare'; op: '<' | '=' | '>' }
  | { c: 'enemyAction'; a: 'strike' | 'block' | 'charge' }
  | { c: 'selfAction'; a: 'block' | 'charge' }
  | { c: 'hitResult'; r: 'clean' | 'blocked' }
  | { c: 'enemyChainAtLeast'; n: number }
  | { c: 'chainAll'; type: CardType }
  | { c: 'chainLength'; op: '=' | '>='; n: number }
  | { c: 'slotIs'; n: number }
  | { c: 'hasFacing' }
  | { c: 'facingSameType' }
  | { c: 'hpAtMost'; n: number }
  | { c: 'hpNotAbove' }

export type ActSpec =
  | { a: 'draw' | 'heal' | 'loseHp' | 'maxHp'; who: P.Who; n: number }
  | { a: 'status'; who: P.Who; kind: StatusKind; turns: number }
  | { a: 'addDmg'; target: P.DmgTarget; n: number; onlyType?: CardType }

/** One rule = when [hook], if all [if], do all [do]. A card can have several rules. */
export type EffectRule = { hook: Hook; if?: CondSpec[]; do: ActSpec[] }
export type EffectSpec = EffectRule[]

function cond(s: CondSpec): Cond {
  switch (s.c) {
    case 'enemyHandAtLeast': return P.enemyHandAtLeast(s.n)
    case 'enemyHandEmpty': return P.enemyHandEmpty
    case 'handCompare': return P.handCompare(s.op)
    case 'enemyAction': return P.enemyAction(s.a)
    case 'selfAction': return P.selfAction(s.a)
    case 'hitResult': return P.hitResult(s.r)
    case 'enemyChainAtLeast': return P.enemyChainAtLeast(s.n)
    case 'chainAll': return P.chainAll(s.type)
    case 'chainLength': return P.chainLength(s.op, s.n)
    case 'slotIs': return P.slotIs(s.n)
    case 'hasFacing': return P.hasFacing
    case 'facingSameType': return P.facingSameType
    case 'hpAtMost': return P.hpAtMost(s.n)
    case 'hpNotAbove': return P.hpNotAbove
  }
}

function act(s: ActSpec): Act {
  switch (s.a) {
    case 'draw': return P.draw(s.who, s.n)
    case 'heal': return P.heal(s.who, s.n)
    case 'loseHp': return P.loseHp(s.who, s.n)
    case 'maxHp': return P.maxHp(s.who, s.n)
    case 'status': return P.status(s.who, s.kind, s.turns)
    case 'addDmg': return P.addDmg(s.target, s.n, s.onlyType)
  }
}

/** Legacy onClean / onBlocked rules → After attack + hitResult condition (same behavior). */
export function normalizeSpec(spec: EffectSpec): EffectSpec {
  return spec.map((rule) =>
    rule.hook === 'onClean' || rule.hook === 'onBlocked'
      ? { ...rule, hook: 'onResolve', if: [{ c: 'hitResult', r: rule.hook === 'onClean' ? 'clean' : 'blocked' }, ...(rule.if ?? [])] }
      : rule,
  )
}

export function compileSpec(spec: EffectSpec): CardEffect {
  const out: CardEffect = {}
  for (const rule of normalizeSpec(spec)) {
    const conds = (rule.if ?? []).map(cond)
    const acts = rule.do.map(act)
    const run: Act = (ctx: ChainCtx) => {
      if (conds.every((c) => c(ctx))) for (const a of acts) a(ctx)
    }
    if (rule.hook === 'onDraw') {
      // onDraw has no chain: only actions without conditions make sense there
      const prev = out.onDraw
      out.onDraw = (ctx) => {
        prev?.(ctx)
        for (const a of acts) (a as unknown as NonNullable<CardEffect['onDraw']>)(ctx)
      }
    } else {
      const prev = out[rule.hook]
      out[rule.hook] = prev ? (ctx) => (prev(ctx), run(ctx)) : run
    }
  }
  return out
}

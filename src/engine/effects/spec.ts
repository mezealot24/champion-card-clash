// Effect as data (cards.effect_json): what the Admin form saves and the engine compiles.
// Same vocabulary as primitives.ts, so every rule here is one primitive call.
import type { CardType, StatusKind } from '../types'
import * as P from './primitives'
import type { Act, BaseCtx, CardEffect, ChainCtx, Cond } from './types'

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
  | { c: 'selfAction'; a: 'strike' | 'block' | 'charge' }
  | { c: 'tookDmg'; n: number }
  | { c: 'hitResult'; r: 'clean' | 'blocked' }
  | { c: 'enemyChainAtLeast'; n: number }
  | { c: 'chainAll'; type: CardType }
  | { c: 'chainLength'; op: '=' | '>='; n: number }
  | { c: 'slotIs'; n: number }
  | { c: 'hasFacing' }
  | { c: 'facingSameType' }
  | { c: 'hpAtMost'; n: number }
  | { c: 'hpNotAbove' }
  | { c: 'hp'; who: 'self' | 'enemy'; op: P.HpOp; n: number; pct?: boolean }
  | { c: 'enteredWith'; n: number }
  | { c: 'silenced'; who: 'self' | 'enemy' }
  | { c: 'hasStatus'; who: 'self' | 'enemy'; kind: StatusKind }

export type ActSpec =
  | { a: 'draw' | 'heal' | 'loseHp'; who: P.Who; n: number; per?: P.Per }
  | { a: 'maxHp'; who: P.Who; n: number }
  | { a: 'status'; who: P.Who; kind: StatusKind; turns: number; n?: number }
  | { a: 'grow'; n: number; dur: 'next' | 'game'; stack?: boolean }
  | { a: 'addDmg'; target: P.DmgTarget; n: number; onlyType?: CardType }
  | { a: 'mulDmg'; target: P.DmgTarget; pct: number; onlyType?: CardType }
  | { a: 'blockNow'; who: P.Who; n: number }

/**
 * One rule = when [hook], if all [if], do all [do]. A card can have several rules.
 * once = fires at most once per game for each copy of the card.
 * at = only for onHeld (Every turn): 'before' fires before the attack, so its statuses count this turn.
 *      Default is after the attack (statuses with 1 turn then count next turn).
 */
export type EffectRule = { hook: Hook; if?: CondSpec[]; do: ActSpec[]; once?: boolean; at?: 'before' }
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
    case 'tookDmg': return P.tookDmg(s.n)
    case 'hpAtMost': return P.hpAtMost(s.n)
    case 'hpNotAbove': return P.hpNotAbove
    case 'hp': return P.hp(s.who, s.op, s.n, s.pct)
    case 'enteredWith': return P.enteredWith(s.n)
    case 'silenced': return P.silenced(s.who)
    case 'hasStatus': return P.hasStatus(s.who, s.kind)
  }
}

function act(s: ActSpec): Act {
  switch (s.a) {
    case 'draw': return P.draw(s.who, s.n, s.per)
    case 'heal': return P.heal(s.who, s.n, s.per)
    case 'loseHp': return P.loseHp(s.who, s.n, s.per)
    case 'maxHp': return P.maxHp(s.who, s.n)
    case 'status': return P.status(s.who, s.kind, s.turns, P.SIZED.includes(s.kind) ? (s.n ?? 1) : undefined)
    case 'grow': return P.grow(s.n, s.dur ?? 'game', s.stack)
    case 'addDmg': return P.addDmg(s.target, s.n, s.onlyType)
    case 'mulDmg': return P.mulDmg(s.target, s.pct, s.onlyType)
    case 'blockNow': return P.blockNow(s.who, s.n)
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
  normalizeSpec(spec).forEach((rule, ri) => {
    const conds = (rule.if ?? []).map(cond)
    const acts = rule.do.map(act)
    // once per game: remember on the card copy that this rule already fired
    const spent = (ctx: BaseCtx) => !!rule.once && !!ctx.card.usedOnce?.includes(ri)
    const fire = (ctx: BaseCtx) => {
      if (rule.once) ctx.card.usedOnce = [...(ctx.card.usedOnce ?? []), ri]
      for (const a of acts) (a as unknown as Act<BaseCtx>)(ctx)
    }
    const run: Act = (ctx: ChainCtx) => {
      if (!spent(ctx) && conds.every((c) => c(ctx))) fire(ctx)
    }
    if (rule.hook === 'onDraw') {
      // onDraw has no chain: only actions without conditions make sense there
      const prev = out.onDraw
      out.onDraw = (ctx) => {
        prev?.(ctx)
        if (!spent(ctx)) fire(ctx)
      }
    } else {
      const key = rule.hook === 'onHeld' && rule.at === 'before' ? 'onHeldBefore' : rule.hook
      const prev = out[key]
      out[key] = prev ? (ctx) => (prev(ctx), run(ctx)) : run
    }
  })
  return out
}

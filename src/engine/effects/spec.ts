// Effect as data (cards.effect_json): what the Admin form saves and the engine compiles.
// Same vocabulary as primitives.ts, so every rule here is one primitive call.
import type { CardType, StatusKind } from '../types'
import * as P from './primitives'
import type { Act, BaseCtx, CardEffect, ChainCtx, Cond } from './types'

/**
 * Timings, Tekken Card Tournament style: modify = Before attack, onResolve = After attack,
 * onHeld = Every turn (Hold), onDraw = Comes into play,
 * onHit = On hit: right after this card's own hit in the chain, so a heal lands before the next hits (Q 2026-10-17).
 * onClean / onBlocked are legacy: normalizeSpec turns them into onResolve + a hitResult condition.
 */
export type Hook = 'modify' | 'onHit' | 'onResolve' | 'onHeld' | 'onDraw' | 'onClean' | 'onBlocked'
export const HOOKS: Hook[] = ['modify', 'onHit', 'onResolve', 'onHeld', 'onDraw']

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
  | { c: 'res'; who: 'self' | 'enemy'; n: number }
  // P/K/S conditions (2026-10-16)
  | { c: 'chainHas'; who: 'self' | 'enemy'; type: CardType; n: number }
  | { c: 'prevIs'; type: CardType }
  | { c: 'facingIs'; type: CardType }
  | { c: 'fieldHas'; who: 'self' | 'enemy'; type: CardType; n: number }

export type ActSpec =
  | { a: 'draw' | 'heal' | 'loseHp'; who: P.Who; n: number; per?: P.Per }
  | { a: 'maxHp'; who: P.Who; n: number }
  | { a: 'status'; who: P.Who; kind: StatusKind; turns: number; n?: number; per?: P.Per }
  | { a: 'grow'; n: number; dur: 'next' | 'game'; stack?: boolean }
  | { a: 'addDmg'; target: P.DmgTarget; n: number; onlyType?: CardType; per?: P.Per }
  | { a: 'mulDmg'; target: P.DmgTarget; pct: number; onlyType?: CardType }
  | { a: 'blockNow'; who: P.Who; n: number }
  | { a: 'pierce'; target: 'this' | 'next' | 'following' | 'chain' }
  | { a: 'steal' }
  | { a: 'cut'; which: P.CutWhich; n: number }
  | { a: 'gainRes'; who: P.Who; n: number; per?: P.Per }

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
    case 'res': return P.resAtLeast(s.who, s.n)
    case 'chainHas': return P.chainHas(s.who, s.type, s.n)
    case 'prevIs': return P.prevIs(s.type)
    case 'facingIs': return P.facingIs(s.type)
    case 'fieldHas': return P.fieldHas(s.who, s.type, s.n)
    // a condition this build doesn't know never passes (old builds reading newer DB rows)
    default: return () => false
  }
}

function act(s: ActSpec): Act {
  switch (s.a) {
    case 'draw': return P.draw(s.who, s.n, s.per)
    case 'heal': return P.heal(s.who, s.n, s.per)
    case 'loseHp': return P.loseHp(s.who, s.n, s.per)
    case 'maxHp': return P.maxHp(s.who, s.n)
    case 'status': return P.status(s.who, s.kind, s.turns, P.SIZED.includes(s.kind) ? (s.n ?? 1) : undefined, P.SIZED.includes(s.kind) ? s.per : undefined)
    case 'grow': return P.grow(s.n, s.dur ?? 'game', s.stack)
    case 'addDmg': return P.addDmg(s.target, s.n, s.onlyType, s.per)
    case 'mulDmg': return P.mulDmg(s.target, s.pct, s.onlyType)
    case 'blockNow': return P.blockNow(s.who, s.n)
    case 'pierce': return P.pierce(s.target)
    case 'steal': return P.steal
    case 'cut': return P.cut(s.which, s.n)
    case 'gainRes': return P.gainRes(s.who, s.n, s.per)
    // an action this build doesn't know does nothing
    default: return () => {}
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

const BAD_FOR_SELF: StatusKind[] = ['noStrike', 'noBlock', 'noCharge', 'silence']
/**
 * A drawback = an action that only hurts its own side (e.g. lose HP, Max HP −, can't Block, lose resource).
 * Q 2026-10-15: an S card you couldn't pay for still pays its drawbacks; everything else is off.
 */
export function isDrawback(a: ActSpec): boolean {
  if (!('who' in a) || a.who !== 'self') return false
  switch (a.a) {
    case 'loseHp': return a.n > 0
    case 'maxHp':
    case 'gainRes':
    case 'blockNow': return a.n < 0
    case 'status': return BAD_FOR_SELF.includes(a.kind) || (a.kind === 'blockPlus' && (a.n ?? 1) < 0)
    default: return false
  }
}

/** The same rules with only their drawback actions; rules with none are dropped. Rule indexes stay (for once per game). */
export function drawbacksOf(spec: EffectSpec): EffectSpec {
  return normalizeSpec(spec).map((rule) => ({ ...rule, do: rule.do.filter(isDrawback) }))
}

export function compileSpec(spec: EffectSpec): CardEffect {
  const out: CardEffect = {}
  normalizeSpec(spec).forEach((rule, ri) => {
    if (!rule.do.length) return
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

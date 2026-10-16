// ตัวต่อ (building blocks) สำหรับเขียน effect การ์ด
// รวมกันเป็น effect ใน registry.ts เช่น when(enemyHandAtLeast(2), heal('self', 10))
import { addRes, resourceOf } from '../resources'
import { drawCards, heal as healHp, log, loseHp as loseHpRaw, toDeckBottom } from '../state'
import type { CardType, Side, StatusKind } from '../types'
import type { Act, BaseCtx, ChainCtx, Cond } from './types'

export type Who = 'self' | 'enemy' | 'both'

function sides(ctx: BaseCtx, who: Who): Side[] {
  if (who === 'both') return [ctx.self, ctx.enemy]
  return [who === 'self' ? ctx.self : ctx.enemy]
}

/** "per X": multiply an amount by a count, e.g. heal 3 per hit you blocked. */
export type Per = 'hitBlocked' | 'chainCard' | 'selfCard' | 'enemyCard' | 'chainP' | 'chainK' | 'chainS' | 'missingHp10' | 'maxHpPct' | 'missingHpPct'

export function perCount(ctx: BaseCtx, per?: Per): number {
  if (!per) return 1
  const c = ctx as Partial<ChainCtx> & BaseCtx
  const hand = (s: Side) => c.handAtStart?.[s] ?? ctx.state.players[s].hand
  switch (per) {
    case 'hitBlocked': return c.hitsBlocked?.[ctx.self] ?? 0
    case 'chainCard': return c.chain?.length ?? 0
    case 'selfCard': return hand(ctx.self).length
    case 'enemyCard': return hand(ctx.enemy).length
    case 'chainP':
    case 'chainK':
    case 'chainS': return (c.chain ?? []).filter((x) => x.def.type === per.slice(5)).length
    // every full 10 HP you are below your Max HP, e.g. "2 per 10 missing HP" = 20% of missing HP
    case 'missingHp10': {
      const p = ctx.state.players[ctx.self]
      return Math.max(0, Math.floor((p.maxHp - p.hp) / 10))
    }
    // 1% of your Max HP / missing HP (fractional; the action rounds down), e.g. "heal 5 per maxHpPct" = 5% of Max HP
    case 'maxHpPct': return ctx.state.players[ctx.self].maxHp / 100
    case 'missingHpPct': {
      const p = ctx.state.players[ctx.self]
      return Math.max(0, p.maxHp - p.hp) / 100
    }
    // a "per" this build doesn't know counts 0 (old builds reading newer DB rows)
    default: return 0
  }
}

// ---------- Actions ----------

/** จั่ว n ใบ. ระหว่างสาย Strike การ์ดจะเข้ามือหลังจบสาย */
export const draw =
  (who: Who, base: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = Math.floor(base * perCount(ctx, per))
    if (n <= 0) return
    for (const s of sides(ctx, who)) {
      if (ctx.pending) ctx.pending[s] += n
      else drawCards(ctx.state, s, n)
    }
    log(ctx.state, `${ctx.card.def.id}: ${who} จั่ว ${n}`)
  }

/** ฮีล n (ไม่เกิน Max HP) */
export const heal =
  (who: Who, base: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = Math.floor(base * perCount(ctx, per))
    if (n <= 0) return
    for (const s of sides(ctx, who)) healHp(ctx.state, s, n)
    log(ctx.state, `${ctx.card.def.id}: ${who} ฮีล ${n}`)
  }

/** เสีย HP n ตรงๆ (ไม่ใช่ hit, ทะลุ Block) */
export const loseHp =
  (who: Who, base: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = Math.floor(base * perCount(ctx, per))
    if (n <= 0) return
    for (const s of sides(ctx, who)) loseHpRaw(ctx.state, s, n)
    log(ctx.state, `${ctx.card.def.id}: ${who} เสีย ${n} HP`)
  }

/** เพิ่ม/ลด Max HP (HP ปัจจุบันไม่เกิน Max ใหม่) */
export const maxHp =
  (who: Who, n: number): Act<BaseCtx> =>
  (ctx) => {
    for (const s of sides(ctx, who)) {
      const p = ctx.state.players[s]
      p.maxHp = Math.max(1, p.maxHp + n)
      p.hp = Math.min(p.hp, p.maxHp)
    }
    log(ctx.state, `${ctx.card.def.id}: ${who} Max HP ${n >= 0 ? '+' : ''}${n}`)
  }

/** ติดสถานะ เช่น ห้าม Strike n เทิร์น (นับเทิร์นถัดไป). blockPlus: Block กันเพิ่ม n hit */
export const status =
  (who: Who, kind: StatusKind, turns = 1, base?: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = base === undefined ? undefined : Math.floor(base * perCount(ctx, per))
    if (n !== undefined && per && n <= 0) return
    for (const s of sides(ctx, who)) ctx.state.players[s].statuses.push(n === undefined ? { kind, turns } : { kind, turns, n })
    log(ctx.state, `${ctx.card.def.id}: ${who} ติด ${kind}${n === undefined ? '' : ` ${n}`} ${turns} เทิร์น`)
  }

/** Before attack only: Block stops n more hits this turn (negative = fewer, never below 0). */
export const blockNow =
  (who: Who, n: number): Act =>
  (ctx) => {
    for (const s of sides(ctx, who)) ctx.blockNow[s] += n
    log(ctx.state, `${ctx.card.def.id}: ${who} Block ${n >= 0 ? '+' : ''}${n} hit เทิร์นนี้`)
  }

/**
 * This card gains +n dmg on its next attack only, or for the rest of the game. Stays on this copy in the deck.
 * Doesn't stack unless `stack` (Q: a buff triggering again keeps it at +n).
 */
export const grow =
  (n: number, dur: 'next' | 'game', stack = false): Act<BaseCtx> =>
  (ctx) => {
    const c = ctx.card
    const key = dur === 'game' ? 'grow' : 'growNext'
    const cur = c[key] ?? 0
    c[key] = stack ? cur + n : n >= 0 ? Math.max(cur, n) : Math.min(cur, n)
    log(ctx.state, `${c.def.id}: dmg ${n >= 0 ? '+' : ''}${n} ${dur === 'game' ? 'ถาวร' : 'ครั้งถัดไป'}`)
  }

/** ใช้ใน hook `modify` เท่านั้น: ปรับ dmg ของการ์ดในสาย */
export type DmgTarget =
  | 'this' // ใบนี้
  | 'next' // ใบถัดไป 1 ใบ
  | 'following' // ทุกใบที่ตามหลัง
  | { slot: number } // ช่องที่ n (นับ 1)
  | { enemySlot: number } // ช่องที่ n ในสายศัตรู (มีผลเมื่อศัตรู Strike)
  | 'facing' // ใบประจันหน้าของศัตรู (มีผลเมื่อศัตรู Strike)
  | 'enemyAll' // ทุกใบในสายศัตรู (มีผลเมื่อศัตรู Strike)

/** Apply fn to every slot the target points at: (array of that chain, slot). */
function eachTarget(ctx: ChainCtx, target: DmgTarget, onlyType: CardType | undefined, mine: number[], theirs: number[] | null, fn: (arr: number[], i: number) => void) {
  const ok = (c?: { def: { type: CardType } }) => !!c && (!onlyType || c.def.type === onlyType)
  if (target === 'facing' || target === 'enemyAll' || (typeof target === 'object' && 'enemySlot' in target)) {
    if (!theirs || !ctx.enemyChain) return
    const slots = target === 'facing' ? [ctx.slot] : target === 'enemyAll' ? ctx.enemyChain.map((_, i) => i) : [target.enemySlot - 1]
    for (const i of slots) if (ok(ctx.enemyChain[i])) fn(theirs, i)
    return
  }
  for (const i of targetSlots(ctx, target)) if (ok(ctx.chain[i])) fn(mine, i)
}

export const addDmg =
  (target: DmgTarget, base: number, onlyType?: CardType, per?: Per): Act =>
  (ctx) => {
    const n = Math.floor(base * perCount(ctx, per))
    eachTarget(ctx, target, onlyType, ctx.bonus, ctx.enemyBonus, (arr, i) => (arr[i] += n))
  }

/** ใช้ใน hook `modify`: คูณ dmg เป็น pct% (50 = ครึ่งเดียว, 200 = x2) ปัดลง */
export const mulDmg =
  (target: DmgTarget, pct: number, onlyType?: CardType): Act =>
  (ctx) =>
    eachTarget(ctx, target, onlyType, ctx.mult, ctx.enemyMult, (arr, i) => (arr[i] *= pct / 100))

/** Before action only: the target cards in your chain ignore Block (Pierce). */
export const pierce =
  (target: 'this' | 'next' | 'following' | 'chain'): Act =>
  (ctx) => {
    const slots = target === 'chain' ? ctx.chain.map((_, i) => i) : targetSlots(ctx, target)
    for (const i of slots) if (i < ctx.pierce.length) ctx.pierce[i] = 1
    if (ctx.chain.length) log(ctx.state, `${ctx.card.def.id}: Pierce (ทะลุ Block)`)
  }

/**
 * Steal: take the opponent's card in the same Field slot as this card (as Fields are now) onto your Field,
 * if you have room. It goes back under its owner's deck once it leaves your Field.
 */
export const steal: Act = (ctx) => {
  const foe = ctx.state.players[ctx.enemy]
  const me = ctx.state.players[ctx.self]
  const taken = foe.hand[ctx.slot]
  if (!taken || me.hand.length >= ctx.state.rules.handMax) return
  foe.hand.splice(ctx.slot, 1)
  taken.owner = taken.owner === ctx.self ? undefined : (taken.owner ?? ctx.enemy)
  me.hand.push(taken)
  log(ctx.state, `${ctx.card.def.id}: ${ctx.self} ขโมย ${taken.def.id} มาไว้บน Field`)
}

/** Which opponent Field card a Cut takes: oldest (slot 1), newest (last slot), or the one in this card's slot. */
export type CutWhich = 'oldest' | 'newest' | 'facing'
/** A side loses at most this many Field cards to Cut effects per turn (Claude default 2026-10-16). Charge break doesn't count. */
export const CUT_CAP = 2

/**
 * Cut (Assassin, Q 2026-10-16): the opponent discards n cards from their Field, as the Field is now.
 * They go to the bottom of their owner's deck, no replacement draw.
 */
export const cut =
  (which: CutWhich, n: number): Act =>
  (ctx) => {
    const foe = ctx.state.players[ctx.enemy]
    for (let k = 0; k < n; k++) {
      if ((foe.cutTaken ?? 0) >= CUT_CAP) {
        log(ctx.state, `${ctx.card.def.id}: Cut ครบ ${CUT_CAP} ใบในเทิร์นนี้แล้ว`)
        return
      }
      const i = which === 'oldest' ? 0 : which === 'newest' ? foe.hand.length - 1 : ctx.slot
      const lost = foe.hand[i]
      if (!lost) return
      foe.hand.splice(i, 1)
      foe.cutTaken = (foe.cutTaken ?? 0) + 1
      ;(foe.discarded ??= []).push({ card: lost, slot: i + 1, reason: 'Cut' })
      toDeckBottom(ctx.state, ctx.enemy, [lost])
      log(ctx.state, `${ctx.card.def.id}: Cut → ${ctx.enemy} ทิ้ง ${lost.def.id} ลงใต้กอง`)
    }
  }

/** Gain (or lose, negative) class resource: Mana / Rage / Energy. Nothing for Tank. */
export const gainRes =
  (who: Who, base: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = Math.floor(base * perCount(ctx, per))
    if (per && n === 0) return
    for (const s of sides(ctx, who)) addRes(ctx.state, s, n)
    log(ctx.state, `${ctx.card.def.id}: ${who} resource ${n >= 0 ? '+' : ''}${n}`)
  }

function targetSlots(ctx: ChainCtx, target: Exclude<DmgTarget, 'facing' | 'enemyAll' | { enemySlot: number }>): number[] {
  if (target === 'this') return [ctx.slot]
  if (target === 'next') return [ctx.slot + 1]
  if (target === 'following') return ctx.chain.map((_, i) => i).filter((i) => i > ctx.slot)
  return [target.slot - 1]
}

// ---------- Combinators ----------

/** ถ้า cond จริง ทำทุก action */
export const when =
  (cond: Cond, ...acts: Act[]): Act =>
  (ctx) => {
    if (cond(ctx)) for (const a of acts) a(ctx)
  }

/** ทำหลาย action ต่อกัน */
export const all =
  (...acts: Act[]): Act =>
  (ctx) => {
    for (const a of acts) a(ctx)
  }

export const and =
  (...conds: Cond[]): Cond =>
  (ctx) =>
    conds.every((c) => c(ctx))

// ---------- Conditions ----------
// จำนวนการ์ดในมือ = ตอนเปิด action (ก่อนตี)

const handOf = (ctx: ChainCtx, who: 'self' | 'enemy') => ctx.handAtStart[who === 'self' ? ctx.self : ctx.enemy]

export const enemyHandAtLeast = (n: number): Cond => (ctx) => handOf(ctx, 'enemy').length >= n
export const enemyHandEmpty: Cond = (ctx) => handOf(ctx, 'enemy').length === 0
export const handCompare =
  (op: '<' | '=' | '>'): Cond =>
  (ctx) => {
    const a = handOf(ctx, 'self').length
    const b = handOf(ctx, 'enemy').length
    return op === '<' ? a < b : op === '>' ? a > b : a === b
  }

export const enemyAction = (a: ChainCtx['enemyAction']): Cond => (ctx) => ctx.enemyAction === a
/** ผลการตีของใบนี้ (ใช้กับ After attack) */
export const hitResult = (r: 'clean' | 'blocked'): Cond => (ctx) => (r === 'clean' ? ctx.clean : ctx.blocked)
export const selfAction = (a: ChainCtx['selfAction']): Cond => (ctx) => ctx.selfAction === a
export const enemyChainAtLeast = (n: number): Cond => (ctx) => (ctx.enemyChain?.length ?? 0) >= n

/** สายของเราเป็นประเภทเดียวล้วน เช่น Kick ล้วน */
export const chainAll = (type: CardType): Cond => (ctx) => ctx.chain.every((c) => c.def.type === type)
export const chainLength =
  (op: '=' | '>=', n: number): Cond =>
  (ctx) =>
    op === '=' ? ctx.chain.length === n : ctx.chain.length >= n

/** ใบนี้อยู่ช่องที่ n (นับ 1) */
export const slotIs = (n: number): Cond => (ctx) => ctx.slot === n - 1

/** มีใบประจันหน้า = มือศัตรูมีการ์ดลำดับเดียวกับใบนี้ (ไม่สน action ศัตรู) */
export const hasFacing: Cond = (ctx) => handOf(ctx, 'enemy').length > ctx.slot
export const facingSameType: Cond = (ctx) => handOf(ctx, 'enemy')[ctx.slot]?.def.type === ctx.card.def.type

// ---------- P/K/S conditions (2026-10-16) ----------
const countType = (cards: { def: { type: CardType } }[], type: CardType) => cards.filter((c) => c.def.type === type).length

/** Your Strike chain (empty if you didn't Strike) / the opponent's (empty if they didn't) has n+ cards of this type. */
export const chainHas =
  (who: 'self' | 'enemy', type: CardType, n: number): Cond =>
  (ctx) =>
    countType(who === 'self' ? ctx.chain : (ctx.enemyChain ?? []), type) >= n
/** The card right before this one in your chain is this type. */
export const prevIs = (type: CardType): Cond => (ctx) => ctx.slot > 0 && ctx.chain[ctx.slot - 1]?.def.type === type
/** The opponent's card in this card's slot (as Fields were at reveal) is this type. */
export const facingIs = (type: CardType): Cond => (ctx) => handOf(ctx, 'enemy')[ctx.slot]?.def.type === type
/** Your / the opponent's Field (at reveal) has n+ cards of this type. */
export const fieldHas =
  (who: 'self' | 'enemy', type: CardType, n: number): Cond =>
  (ctx) =>
    countType(handOf(ctx, who), type) >= n

/** เราโดน hit รวม ≥ n dmg ในเทิร์นนี้ (Block ที่กันได้ไม่นับ) */
export const tookDmg = (n: number): Cond => (ctx) => ctx.hitDmgTaken[ctx.self] >= n

export type HpOp = '<' | '<=' | '>' | '>='
/** HP compare. pct = n is a % of that side's Max HP (e.g. HP < 30%). */
export const hp =
  (who: 'self' | 'enemy', op: HpOp, n: number, pct = false): Cond =>
  (ctx) => {
    const p = ctx.state.players[who === 'self' ? ctx.self : ctx.enemy]
    const v = pct ? (p.hp * 100) / p.maxHp : p.hp
    return op === '<' ? v < n : op === '<=' ? v <= n : op === '>' ? v > n : v >= n
  }

/** You had n+ cards on your Field (this one included) when this card came into play. */
export const enteredWith = (n: number): Cond => (ctx) => (ctx.card.enteredWith ?? 0) >= n

export const hpAtMost = (n: number): Cond => (ctx) => ctx.state.players[ctx.self].hp <= n
export const hpNotAbove: Cond = (ctx) => ctx.state.players[ctx.self].hp <= ctx.state.players[ctx.enemy].hp
/** you / the opponent are Silenced this turn */
export const silenced = (who: 'self' | 'enemy'): Cond => (ctx) => !!ctx.state.players[who === 'self' ? ctx.self : ctx.enemy].silenced
/** you / the opponent have an active status of this kind (e.g. a Shield that isn't used up) */
export const hasStatus = (who: 'self' | 'enemy', kind: StatusKind): Cond => (ctx) =>
  ctx.state.players[who === 'self' ? ctx.self : ctx.enemy].statuses.some((s) => s.kind === kind && (s.n ?? 1) > 0)

/** you / the opponent have N+ of your class resource (Tank: HP) */
export const resAtLeast = (who: 'self' | 'enemy', n: number): Cond => (ctx) => {
  const p = ctx.state.players[who === 'self' ? ctx.self : ctx.enemy]
  return (resourceOf(p.championId)?.payWithHp ? p.hp : (p.res ?? 0)) >= n
}

/** Status kinds that carry a size n */
export const SIZED: StatusKind[] = ['blockPlus', 'shield', 'parry', 'vulnerable']

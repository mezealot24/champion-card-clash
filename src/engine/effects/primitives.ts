// ตัวต่อ (building blocks) สำหรับเขียน effect การ์ด
// รวมกันเป็น effect ใน registry.ts เช่น when(enemyHandAtLeast(2), heal('self', 10))
import { drawCards, heal as healHp, log, loseHp as loseHpRaw } from '../state'
import type { CardType, Side, StatusKind } from '../types'
import type { Act, BaseCtx, ChainCtx, Cond } from './types'

export type Who = 'self' | 'enemy' | 'both'

function sides(ctx: BaseCtx, who: Who): Side[] {
  if (who === 'both') return [ctx.self, ctx.enemy]
  return [who === 'self' ? ctx.self : ctx.enemy]
}

/** "per X": multiply an amount by a count, e.g. heal 3 per hit you blocked. */
export type Per = 'hitBlocked' | 'chainCard' | 'selfCard' | 'enemyCard'

export function perCount(ctx: BaseCtx, per?: Per): number {
  if (!per) return 1
  const c = ctx as Partial<ChainCtx> & BaseCtx
  const hand = (s: Side) => c.handAtStart?.[s] ?? ctx.state.players[s].hand
  switch (per) {
    case 'hitBlocked': return c.hitsBlocked?.[ctx.self] ?? 0
    case 'chainCard': return c.chain?.length ?? 0
    case 'selfCard': return hand(ctx.self).length
    case 'enemyCard': return hand(ctx.enemy).length
  }
}

// ---------- Actions ----------

/** จั่ว n ใบ. ระหว่างสาย Strike การ์ดจะเข้ามือหลังจบสาย */
export const draw =
  (who: Who, base: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = base * perCount(ctx, per)
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
    const n = base * perCount(ctx, per)
    if (n <= 0) return
    for (const s of sides(ctx, who)) healHp(ctx.state, s, n)
    log(ctx.state, `${ctx.card.def.id}: ${who} ฮีล ${n}`)
  }

/** เสีย HP n ตรงๆ (ไม่ใช่ hit, ทะลุ Block) */
export const loseHp =
  (who: Who, base: number, per?: Per): Act<BaseCtx> =>
  (ctx) => {
    const n = base * perCount(ctx, per)
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
  (who: Who, kind: StatusKind, turns = 1, n?: number): Act<BaseCtx> =>
  (ctx) => {
    for (const s of sides(ctx, who)) ctx.state.players[s].statuses.push(n === undefined ? { kind, turns } : { kind, turns, n })
    log(ctx.state, `${ctx.card.def.id}: ${who} ติด ${kind}${n === undefined ? '' : ` ${n}`} ${turns} เทิร์น`)
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
  | 'facing' // ใบประจันหน้าของศัตรู (มีผลเมื่อศัตรู Strike)

export const addDmg =
  (target: DmgTarget, n: number, onlyType?: CardType): Act =>
  (ctx) => {
    if (target === 'facing') {
      const f = ctx.enemyChain?.[ctx.slot]
      if (ctx.enemyBonus && f && (!onlyType || f.def.type === onlyType)) ctx.enemyBonus[ctx.slot] += n
      return
    }
    for (const i of targetSlots(ctx, target)) {
      const c = ctx.chain[i]
      if (c && (!onlyType || c.def.type === onlyType)) ctx.bonus[i] += n
    }
  }

function targetSlots(ctx: ChainCtx, target: Exclude<DmgTarget, 'facing'>): number[] {
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

export const hpAtMost = (n: number): Cond => (ctx) => ctx.state.players[ctx.self].hp <= n
export const hpNotAbove: Cond = (ctx) => ctx.state.players[ctx.self].hp <= ctx.state.players[ctx.enemy].hp

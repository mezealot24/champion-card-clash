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

// ---------- Actions ----------

/** จั่ว n ใบ. ระหว่างสาย Strike การ์ดจะเข้ามือหลังจบสาย */
export const draw =
  (who: Who, n: number): Act<BaseCtx> =>
  (ctx) => {
    for (const s of sides(ctx, who)) {
      if (ctx.pending) ctx.pending[s] += n
      else drawCards(ctx.state, s, n)
    }
    log(ctx.state, `${ctx.card.def.id}: ${who} จั่ว ${n}`)
  }

/** ฮีล n (ไม่เกิน Max HP) */
export const heal =
  (who: Who, n: number): Act<BaseCtx> =>
  (ctx) => {
    for (const s of sides(ctx, who)) healHp(ctx.state, s, n)
    log(ctx.state, `${ctx.card.def.id}: ${who} ฮีล ${n}`)
  }

/** เสีย HP n ตรงๆ (ไม่ใช่ hit, ทะลุ Block) */
export const loseHp =
  (who: Who, n: number): Act<BaseCtx> =>
  (ctx) => {
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

/** ติดสถานะ เช่น ห้าม Strike n เทิร์น (นับเทิร์นถัดไป) */
export const status =
  (who: Who, kind: StatusKind, turns = 1): Act<BaseCtx> =>
  (ctx) => {
    for (const s of sides(ctx, who)) ctx.state.players[s].statuses.push({ kind, turns })
    log(ctx.state, `${ctx.card.def.id}: ${who} ติด ${kind} ${turns} เทิร์น`)
  }

/** This card gains +n dmg for the rest of the game (stacks; stays on this copy when it goes back to the deck) */
export const grow =
  (n: number): Act<BaseCtx> =>
  (ctx) => {
    ctx.card.grow = (ctx.card.grow ?? 0) + n
    log(ctx.state, `${ctx.card.def.id}: dmg ${n >= 0 ? '+' : ''}${n} ถาวร (รวม ${ctx.card.def.dmg + ctx.card.grow})`)
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

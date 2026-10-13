// Effect Registry: card ID → โค้ด effect
// ข้อความ effect ใน Supabase (cards.effect) ใช้แสดงผลอย่างเดียว พฤติกรรมจริงอยู่ที่นี่
// การ์ดที่มีข้อความแต่ยังไม่มีในไฟล์นี้ = เล่นเป็น dmg เปล่า (UI ควรขึ้น ⚠)
//
// วิธีแก้ effect: เปลี่ยนบรรทัดของการ์ดนั้น ใช้ตัวต่อจาก primitives.ts
//   hook: modify (ปรับ dmg ก่อนตี) | onResolve (ตอนตี โดน Block ก็ทำงาน) | onClean | onBlocked | onDraw
import type { CardEffect } from './types'
import {
  addDmg,
  chainAll,
  chainLength,
  draw,
  enemyAction,
  enemyChainAtLeast,
  enemyHandAtLeast,
  enemyHandEmpty,
  hasFacing,
  heal,
  loseHp,
  and,
  when,
} from './primitives'

export const EFFECTS: Record<string, CardEffect> = {
  // ---------- Bruiser ----------
  // เราเสีย 3 HP
  'BR-001': { onResolve: loseHp('self', 3) },
  // ถ้าศัตรูมือว่าง: ศัตรูจั่ว 1
  'BR-002': { onResolve: when(enemyHandEmpty, draw('enemy', 1)) },
  // ถ้ามีใบประจันหน้า: ใบนี้ −4
  'BR-004': { modify: when(hasFacing, addDmg('this', -4)) },
  // ถ้าสายเป็น Kick ล้วน: ทั้งคู่จั่ว 1
  'BR-005': { onResolve: when(chainAll('K'), draw('both', 1)) },
  // ถ้าศัตรูมี ≥4 ใบ: ใบที่ตามหลัง +2  (ตีความเป็น "ใบถัดไป 1 ใบ"; อยากให้ทุกใบหลังจากนี้ เปลี่ยน 'next' เป็น 'following')
  'BR-006': { modify: when(enemyHandAtLeast(4), addDmg('next', 2)) },
  // ทั้งคู่จั่ว 1
  'BR-007': { onResolve: draw('both', 1) },
  // ถ้าศัตรู Strike สาย ≥3 ใบ: จั่ว 1
  'BR-008': { onResolve: when(and(enemyAction('strike'), enemyChainAtLeast(3)), draw('self', 1)) },
  // ถ้าสายมีใบเดียว: จั่ว 1
  'BR-009': { onResolve: when(chainLength('=', 1), draw('self', 1)) },
  // ถ้าศัตรูมี ≥2 ใบ: ฮีล 10
  'BR-010': { onResolve: when(enemyHandAtLeast(2), heal('self', 10)) },
  // ถ้าสายเป็น Punch ล้วน: ใบที่ 3 +8
  'BR-011': { modify: when(chainAll('P'), addDmg({ slot: 3 }, 8)) },
  // BR-003, BR-012..015: ไม่มี effect
}

export const getEffect = (cardId: string): CardEffect | undefined => EFFECTS[cardId]

/** มีข้อความ effect แต่ยังไม่มีโค้ด → ให้ UI ขึ้น ⚠ */
export const isEffectMissing = (cardId: string, effectText: string) =>
  effectText.trim() !== '' && !(cardId in EFFECTS)

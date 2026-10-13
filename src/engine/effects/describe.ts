// effect_json → ข้อความภาษาไทยสั้นๆ (ใช้ในฟอร์ม Admin และเป็นข้อความ effect ได้)
import type { ActSpec, CondSpec, EffectSpec, Hook } from './spec'
import type { DmgTarget, Who } from './primitives'

export const HOOK_TH: Record<Hook, string> = {
  modify: 'ก่อนตี',
  onResolve: 'เมื่อออก',
  onClean: 'ถ้า clean',
  onBlocked: 'ถ้าโดน Block',
  onDraw: 'เมื่อจั่วได้',
}
const WHO_TH: Record<Who, string> = { self: 'เรา', enemy: 'ศัตรู', both: 'ทั้งคู่' }
const ACTION_TH = { strike: 'Strike', block: 'Block', charge: 'Charge' }
const TYPE_TH = { P: 'Punch', K: 'Kick', S: 'Skill' }
const STATUS_TH = { noStrike: 'Strike ไม่ได้', noBlock: 'Block ไม่ได้', noCharge: 'Charge ไม่ได้' }

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)

export function describeCond(c: CondSpec): string {
  switch (c.c) {
    case 'enemyHandAtLeast': return `ศัตรูมี ≥${c.n} ใบ`
    case 'enemyHandEmpty': return 'ศัตรูมือว่าง'
    case 'handCompare': return { '<': 'เรามีการ์ดน้อยกว่าศัตรู', '=': 'มีการ์ดเท่าศัตรู', '>': 'เรามีการ์ดมากกว่าศัตรู' }[c.op]
    case 'enemyAction': return `ศัตรู ${ACTION_TH[c.a]}`
    case 'enemyChainAtLeast': return `ศัตรู Strike สาย ≥${c.n} ใบ`
    case 'chainAll': return `สายเป็น ${TYPE_TH[c.type]} ล้วน`
    case 'chainLength': return c.op === '=' ? `สายมี ${c.n} ใบ` : `สาย ≥${c.n} ใบ`
    case 'slotIs': return `อยู่ช่อง ${c.n}`
    case 'hasFacing': return 'มีใบประจันหน้า'
    case 'facingSameType': return 'ใบประจันหน้าประเภทเดียวกัน'
    case 'hpAtMost': return `HP เรา ≤${c.n}`
    case 'hpNotAbove': return 'HP เรา ≤ ศัตรู'
  }
}

function describeTarget(t: DmgTarget): string {
  if (typeof t === 'object') return `ใบที่ ${t.slot}`
  return { this: 'ใบนี้', next: 'ใบถัดไป', following: 'ทุกใบที่ตามหลัง', facing: 'ใบประจันหน้า' }[t]
}

export function describeAct(a: ActSpec): string {
  switch (a.a) {
    case 'draw': return `${WHO_TH[a.who]}จั่ว ${a.n}`
    case 'heal': return `${WHO_TH[a.who]}ฮีล ${a.n}`
    case 'loseHp': return `${WHO_TH[a.who]}เสีย ${a.n} HP`
    case 'maxHp': return `${WHO_TH[a.who]} Max HP ${signed(a.n)}`
    case 'status': return `${WHO_TH[a.who]}${STATUS_TH[a.kind]} ${a.turns} เทิร์น`
    case 'addDmg': return `${describeTarget(a.target)}${a.onlyType ? ` (เฉพาะ ${TYPE_TH[a.onlyType]})` : ''} dmg ${signed(a.n)}`
  }
}

export function describeSpec(spec: EffectSpec | null | undefined): string {
  return (spec ?? [])
    .map((r) => {
      const conds = (r.if ?? []).map(describeCond)
      const when = r.hook === 'onResolve' && conds.length ? '' : HOOK_TH[r.hook]
      const head = [when, conds.length ? `ถ้า${conds.join(' และ ')}` : ''].filter(Boolean).join(' ')
      return `${head}: ${r.do.map(describeAct).join(', ')}`
    })
    .join(' / ')
}

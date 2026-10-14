// Form for cards.effect_json: rules of "when [hook], if [conditions], do [actions]".
import type { ActSpec, CondSpec, EffectRule, EffectSpec, Hook } from '../engine'
import { HOOK_TH, describeAct, describeCond, describeSpec } from '../engine/effects/describe'

type Props = { value: EffectSpec | null; onChange: (v: EffectSpec | null) => void; onUseText: (text: string) => void }

const HOOKS = Object.keys(HOOK_TH) as Hook[]

// default value per kind, used when adding or switching kind
const COND_DEFAULTS: Record<CondSpec['c'], CondSpec> = {
  enemyHandAtLeast: { c: 'enemyHandAtLeast', n: 3 },
  enemyHandEmpty: { c: 'enemyHandEmpty' },
  handCompare: { c: 'handCompare', op: '<' },
  enemyAction: { c: 'enemyAction', a: 'strike' },
  selfAction: { c: 'selfAction', a: 'block' },
  enemyChainAtLeast: { c: 'enemyChainAtLeast', n: 3 },
  chainAll: { c: 'chainAll', type: 'K' },
  chainLength: { c: 'chainLength', op: '=', n: 1 },
  slotIs: { c: 'slotIs', n: 1 },
  hasFacing: { c: 'hasFacing' },
  facingSameType: { c: 'facingSameType' },
  hpAtMost: { c: 'hpAtMost', n: 30 },
  hpNotAbove: { c: 'hpNotAbove' },
}
const ACT_DEFAULTS: Record<string, ActSpec> = {
  draw: { a: 'draw', who: 'self', n: 1 },
  heal: { a: 'heal', who: 'self', n: 5 },
  loseHp: { a: 'loseHp', who: 'enemy', n: 2 },
  maxHp: { a: 'maxHp', who: 'self', n: 5 },
  status: { a: 'status', who: 'enemy', kind: 'noBlock', turns: 1 },
  addDmg: { a: 'addDmg', target: 'this', n: 2 },
}
const ACT_LABEL: Record<string, string> = {
  draw: 'จั่ว', heal: 'ฮีล', loseHp: 'เสีย HP', maxHp: 'Max HP', status: 'ติดสถานะ', addDmg: 'ปรับ dmg',
}

const replaceAt = <T,>(list: T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x))
const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i)

export function EffectBuilder({ value, onChange, onUseText }: Props) {
  const rules = value ?? []
  const set = (next: EffectRule[]) => onChange(next.length ? next : null)
  const text = describeSpec(rules)

  return (
    <details className="effect-builder">
      <summary>{rules.length ? `⚙ ${text}` : '⚙ ยังไม่มี effect ที่ทำงานจริง (กดเพื่อสร้าง)'}</summary>
      {rules.map((rule, ri) => (
        <div className="rule" key={ri}>
          <div className="rule-row">
            <strong>เมื่อ</strong>
            <select value={rule.hook} onChange={(e) => set(replaceAt(rules, ri, { ...rule, hook: e.target.value as Hook }))}>
              {HOOKS.map((h) => <option key={h} value={h}>{HOOK_TH[h]}</option>)}
            </select>
            <button type="button" className="danger" onClick={() => set(removeAt(rules, ri))} title="ลบกฎนี้">✕</button>
          </div>
          {rule.hook === 'modify' && <p className="muted hint">ก่อนตี = ใช้กับ "ปรับ dmg" ของใบในสาย</p>}
          {rule.hook === 'onHeld' && <p className="muted hint">ทำงานทุกเทิร์นที่การ์ดอยู่ในมือและเราไม่ได้ Strike (ทุกใบที่ถืออยู่ทำงานแยกกัน) · ใส่เงื่อนไข "เรา Block" ถ้าอยากให้ทำงานเฉพาะตอน Block</p>}

          {(rule.if ?? []).map((cond, ci) => (
            <div className="rule-row" key={`c${ci}`}>
              <span>{ci === 0 ? 'ถ้า' : 'และ'}</span>
              <CondEditor value={cond} onChange={(v) => set(replaceAt(rules, ri, { ...rule, if: replaceAt(rule.if ?? [], ci, v) }))} />
              <button type="button" className="danger" onClick={() => set(replaceAt(rules, ri, { ...rule, if: removeAt(rule.if ?? [], ci) }))}>✕</button>
            </div>
          ))}
          {rule.do.map((act, ai) => (
            <div className="rule-row" key={`a${ai}`}>
              <span>ทำ</span>
              <ActEditor value={act} onChange={(v) => set(replaceAt(rules, ri, { ...rule, do: replaceAt(rule.do, ai, v) }))} />
              <button type="button" className="danger" onClick={() => set(replaceAt(rules, ri, { ...rule, do: removeAt(rule.do, ai) }))}>✕</button>
            </div>
          ))}
          <div className="rule-row">
            {rule.hook !== 'onDraw' && (
              <button type="button" className="secondary" onClick={() => set(replaceAt(rules, ri, { ...rule, if: [...(rule.if ?? []), COND_DEFAULTS.enemyHandAtLeast] }))}>
                + เงื่อนไข
              </button>
            )}
            <button type="button" className="secondary" onClick={() => set(replaceAt(rules, ri, { ...rule, do: [...rule.do, ACT_DEFAULTS.draw] }))}>
              + ผลลัพธ์
            </button>
          </div>
        </div>
      ))}
      <div className="rule-row">
        <button type="button" className="secondary" onClick={() => set([...rules, { hook: 'onResolve', do: [ACT_DEFAULTS.draw] }])}>+ กฎใหม่</button>
        {rules.length > 0 && (
          <button type="button" className="secondary" onClick={() => onUseText(text)} title="เขียนทับช่อง Effect ด้วยข้อความนี้">
            ใช้เป็นข้อความ Effect
          </button>
        )}
      </div>
    </details>
  )
}

function CondEditor({ value, onChange }: { value: CondSpec; onChange: (v: CondSpec) => void }) {
  return (
    <>
      <select value={value.c} onChange={(e) => onChange(COND_DEFAULTS[e.target.value as CondSpec['c']])}>
        {Object.values(COND_DEFAULTS).map((d) => <option key={d.c} value={d.c}>{describeCond(d).replace(/\d+/g, 'N')}</option>)}
      </select>
      {'n' in value && <Num value={value.n} onChange={(n) => onChange({ ...value, n })} />}
      {value.c === 'handCompare' && (
        <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as '<' | '=' | '>' })}>
          <option value="<">น้อยกว่า</option><option value="=">เท่ากับ</option><option value=">">มากกว่า</option>
        </select>
      )}
      {value.c === 'chainLength' && (
        <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as '=' | '>=' })}>
          <option value="=">=</option><option value=">=">≥</option>
        </select>
      )}
      {value.c === 'enemyAction' && (
        <select value={value.a} onChange={(e) => onChange({ ...value, a: e.target.value as 'strike' | 'block' | 'charge' })}>
          <option value="strike">Strike</option><option value="block">Block</option><option value="charge">Charge</option>
        </select>
      )}
      {value.c === 'selfAction' && (
        <select value={value.a} onChange={(e) => onChange({ ...value, a: e.target.value as 'block' | 'charge' })}>
          <option value="block">Block</option><option value="charge">Charge</option>
        </select>
      )}
      {value.c === 'chainAll' && <TypeSelect value={value.type} onChange={(type) => onChange({ ...value, type: type! })} />}
    </>
  )
}

function ActEditor({ value, onChange }: { value: ActSpec; onChange: (v: ActSpec) => void }) {
  return (
    <>
      <select value={value.a} onChange={(e) => onChange(ACT_DEFAULTS[e.target.value])}>
        {Object.keys(ACT_DEFAULTS).map((k) => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}
      </select>
      {'who' in value && (
        <select value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value as 'self' | 'enemy' | 'both' })}>
          <option value="self">เรา</option><option value="enemy">ศัตรู</option><option value="both">ทั้งคู่</option>
        </select>
      )}
      {value.a === 'status' && (
        <>
          <select value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as typeof value.kind })}>
            <option value="noStrike">Strike ไม่ได้</option><option value="noBlock">Block ไม่ได้</option><option value="noCharge">Charge ไม่ได้</option>
          </select>
          <Num value={value.turns} min={1} onChange={(turns) => onChange({ ...value, turns })} /> เทิร์น
        </>
      )}
      {value.a === 'addDmg' && (
        <>
          <select
            value={typeof value.target === 'object' ? 'slot' : value.target}
            onChange={(e) => onChange({ ...value, target: e.target.value === 'slot' ? { slot: 1 } : (e.target.value as 'this') })}
          >
            <option value="this">ใบนี้</option><option value="next">ใบถัดไป</option><option value="following">ทุกใบที่ตามหลัง</option>
            <option value="slot">ช่องที่…</option><option value="facing">ใบประจันหน้า</option>
          </select>
          {typeof value.target === 'object' && <Num value={value.target.slot} min={1} onChange={(slot) => onChange({ ...value, target: { slot } })} />}
          <TypeSelect value={value.onlyType} allowAny onChange={(onlyType) => onChange({ ...value, onlyType })} />
        </>
      )}
      {'n' in value && <Num value={value.n} min={value.a === 'addDmg' || value.a === 'maxHp' ? undefined : 0} onChange={(n) => onChange({ ...value, n })} />}
      <span className="muted">→ {describeAct(value)}</span>
    </>
  )
}

function Num({ value, onChange, min }: { value: number; onChange: (n: number) => void; min?: number }) {
  return <input className="num" type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} />
}

function TypeSelect(props: { value?: 'P' | 'K' | 'S'; allowAny?: boolean; onChange: (t: 'P' | 'K' | 'S' | undefined) => void }) {
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange((e.target.value || undefined) as 'P' | undefined)}>
      {props.allowAny && <option value="">ทุกประเภท</option>}
      <option value="P">Punch</option><option value="K">Kick</option><option value="S">Skill</option>
    </select>
  )
}

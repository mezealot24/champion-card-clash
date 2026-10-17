// Form for cards.effect_json: rules of "when [hook], if [conditions], do [actions]".
import type { ActSpec, CondSpec, EffectRule, EffectSpec, Hook } from '../engine'
import { HOOK_LABEL, PER_LABEL, describeAct, describeSpec } from '../engine/effects/describe'
import { HOOKS, normalizeSpec } from '../engine/effects/spec'

type Props = { value: EffectSpec | null; onChange: (v: EffectSpec | null) => void; onUseText: (text: string) => void }

// default value per kind, used when adding or switching kind
const COND_DEFAULTS: Record<CondSpec['c'], CondSpec> = {
  hitResult: { c: 'hitResult', r: 'clean' },
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
  tookDmg: { c: 'tookDmg', n: 1 },
  hpAtMost: { c: 'hpAtMost', n: 30 },
  hpNotAbove: { c: 'hpNotAbove' },
  hp: { c: 'hp', who: 'self', op: '<', n: 30, pct: true },
  enteredWith: { c: 'enteredWith', n: 2 },
  silenced: { c: 'silenced', who: 'enemy' },
  hasStatus: { c: 'hasStatus', who: 'self', kind: 'shield' },
  res: { c: 'res', who: 'self', n: 3 },
  chainHas: { c: 'chainHas', who: 'self', type: 'P', n: 1 },
  prevIs: { c: 'prevIs', type: 'P' },
  facingIs: { c: 'facingIs', type: 'K' },
  fieldHas: { c: 'fieldHas', who: 'enemy', type: 'K', n: 2 },
}
const COND_LABEL: Record<CondSpec['c'], string> = {
  hitResult: 'Hit result is…',
  selfAction: 'You play…',
  enemyAction: 'Opponent plays…',
  enemyHandAtLeast: 'Opponent has N+ cards',
  enemyHandEmpty: "Opponent's hand is empty",
  handCompare: 'You have … cards than opponent',
  enemyChainAtLeast: 'Opponent Strikes with N+ cards',
  chainAll: 'Your chain is all…',
  chainLength: 'Your chain length is…',
  slotIs: 'This card is in slot N',
  hasFacing: 'There is a facing card',
  facingSameType: 'Facing card is the same type',
  tookDmg: 'You take N+ dmg from hits this turn',
  hpAtMost: 'Your HP ≤ N',
  hpNotAbove: "Your HP ≤ opponent's HP",
  hp: 'HP compare (you / opponent, number or %)',
  enteredWith: 'You had N+ cards when this came into play',
  silenced: 'You / opponent is Silenced',
  hasStatus: 'You / opponent has Shield / Parry / …',
  res: 'You / opponent has N+ resource (Mana / Rage / Energy)',
  chainHas: 'Your / opponent\'s chain has N+ Punch / Kick / Skill',
  prevIs: 'Card before this one is…',
  facingIs: 'Facing card is…',
  fieldHas: 'You / opponent has N+ Punch / Kick / Skill on the Field',
}
const ACT_DEFAULTS: Record<string, ActSpec> = {
  draw: { a: 'draw', who: 'self', n: 1 },
  heal: { a: 'heal', who: 'self', n: 5 },
  loseHp: { a: 'loseHp', who: 'enemy', n: 2 },
  maxHp: { a: 'maxHp', who: 'self', n: 5 },
  status: { a: 'status', who: 'enemy', kind: 'noBlock', turns: 1 },
  addDmg: { a: 'addDmg', target: 'this', n: 2 },
  mulDmg: { a: 'mulDmg', target: 'enemyAll', pct: 50 },
  grow: { a: 'grow', n: 5, dur: 'next' },
  blockNow: { a: 'blockNow', who: 'enemy', n: -1 },
  pierce: { a: 'pierce', target: 'this' },
  steal: { a: 'steal' },
  cut: { a: 'cut', which: 'oldest', n: 1 },
  gainRes: { a: 'gainRes', who: 'self', n: 1 },
}
const ACT_LABEL: Record<string, string> = {
  draw: 'Draw', heal: 'Gain HP', loseHp: 'Lose HP', maxHp: 'Max HP', status: 'Status', addDmg: 'Change dmg (this chain)', mulDmg: 'Dmg × % (this chain)', grow: 'Gain dmg (later attacks)', blockNow: 'Block ±N hits (this turn)',
  pierce: 'Pierce: ignore Block (Before action)', steal: "Steal opponent's card in this slot", cut: 'Cut: opponent discards Field cards', gainRes: 'Gain resource',
}

const replaceAt = <T,>(list: T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x))
const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i)

export function EffectBuilder({ value, onChange, onUseText }: Props) {
  const rules = normalizeSpec(value ?? [])
  const set = (next: EffectRule[]) => onChange(next.length ? next : null)
  const text = describeSpec(rules)

  return (
    <details className="effect-builder">
      <summary>{rules.length ? `⚙ ${text}` : '⚙ No working effect yet (click to build)'}</summary>
      {rules.map((rule, ri) => (
        <div className="rule" key={ri}>
          <div className="rule-row">
            <strong>When</strong>
            <select value={rule.hook} onChange={(e) => set(replaceAt(rules, ri, { ...rule, hook: e.target.value as Hook }))}>
              {HOOKS.map((h) => <option key={h} value={h}>{HOOK_LABEL[h]}</option>)}
            </select>
            {rule.hook === 'onHeld' && (
              <select
                value={rule.at ?? 'after'}
                onChange={(e) => set(replaceAt(rules, ri, { ...rule, at: e.target.value === 'before' ? 'before' : undefined }))}
                title="When in the turn it fires"
              >
                <option value="after">end of turn (effects land next turn)</option>
                <option value="before">start of turn (effects land this turn)</option>
              </select>
            )}
            <label className="inline" title="Fires at most once per game for each copy of this card">
              <input type="checkbox" checked={!!rule.once} onChange={(e) => set(replaceAt(rules, ri, { ...rule, once: e.target.checked || undefined }))} /> once per game
            </label>
            <button type="button" className="danger" onClick={() => set(removeAt(rules, ri))} title="Delete rule">✕</button>
          </div>
          {rule.hook === 'modify' && <p className="muted hint">Right after actions are revealed, before any hit, whatever action you picked (Strike, Block or Charge). Add "You play Strike" if it should only work in your chain. Use with "Change dmg", "Dmg × %" or "Block ±N hits (this turn)".</p>}
          {rule.hook === 'onHit' && <p className="muted hint">Right after this card's own hit in your Strike chain, before the next hit lands (both chains take turns slot by slot). Only when you Strike. "Hit result" checks how this hit went. A side at 0 HP can't be healed.</p>}
          {rule.hook === 'onResolve' && <p className="muted hint">End of the turn, whatever action you picked (Strike, Block or Charge). Add "You play Strike" if it should only work when this card attacked. "Hit result" checks how this card's own hit went.</p>}
          {rule.hook === 'onHeld' && <p className="muted hint">Every turn this card stays on your Field (you didn't Strike). End of turn by default; pick "start of turn" for effects that should count this turn. Each copy fires on its own. Add "you play Block" to fire only on Block.</p>}

          {(rule.if ?? []).map((cond, ci) => (
            <div className="rule-row" key={`c${ci}`}>
              <span>{ci === 0 ? 'If' : 'And'}</span>
              <CondEditor value={cond} onChange={(v) => set(replaceAt(rules, ri, { ...rule, if: replaceAt(rule.if ?? [], ci, v) }))} />
              <button type="button" className="danger" onClick={() => set(replaceAt(rules, ri, { ...rule, if: removeAt(rule.if ?? [], ci) }))}>✕</button>
            </div>
          ))}
          {rule.do.map((act, ai) => (
            <div className="rule-row" key={`a${ai}`}>
              <span>Do</span>
              <ActEditor value={act} onChange={(v) => set(replaceAt(rules, ri, { ...rule, do: replaceAt(rule.do, ai, v) }))} />
              <button type="button" className="danger" onClick={() => set(replaceAt(rules, ri, { ...rule, do: removeAt(rule.do, ai) }))}>✕</button>
            </div>
          ))}
          <div className="rule-row">
            {rule.hook !== 'onDraw' && (
              <button type="button" className="secondary" onClick={() => set(replaceAt(rules, ri, { ...rule, if: [...(rule.if ?? []), COND_DEFAULTS.enemyHandAtLeast] }))}>
                + Condition
              </button>
            )}
            <button type="button" className="secondary" onClick={() => set(replaceAt(rules, ri, { ...rule, do: [...rule.do, ACT_DEFAULTS.draw] }))}>
              + Effect
            </button>
          </div>
        </div>
      ))}
      <div className="rule-row">
        <button type="button" className="secondary" onClick={() => set([...rules, { hook: 'onResolve', do: [ACT_DEFAULTS.draw] }])}>+ New rule</button>
        {rules.length > 0 && (
          <button type="button" className="secondary" onClick={() => onUseText(text)} title="Overwrite the Effect text with this">
            Use as effect text
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
        {Object.values(COND_DEFAULTS).map((d) => <option key={d.c} value={d.c}>{COND_LABEL[d.c]}</option>)}
      </select>
      {'n' in value && value.c !== 'hp' && <Num value={value.n} onChange={(n) => onChange({ ...value, n })} />}
      {value.c === 'handCompare' && (
        <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as '<' | '=' | '>' })}>
          <option value="<">fewer</option><option value="=">equal</option><option value=">">more</option>
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
      {value.c === 'hitResult' && (
        <select value={value.r} onChange={(e) => onChange({ ...value, r: e.target.value as 'clean' | 'blocked' })}>
          <option value="clean">clean</option><option value="blocked">blocked</option>
        </select>
      )}
      {value.c === 'selfAction' && (
        <select value={value.a} onChange={(e) => onChange({ ...value, a: e.target.value as 'strike' | 'block' | 'charge' })}>
          <option value="strike">Strike</option><option value="block">Block</option><option value="charge">Charge</option>
        </select>
      )}
      {value.c === 'hasStatus' && (
        <>
          <select value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value as 'self' | 'enemy' })}>
            <option value="self">you</option><option value="enemy">opponent</option>
          </select>
          <select value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as typeof value.kind })}>
            <option value="shield">Shield</option><option value="parry">Parry</option><option value="silence">Silenced</option>
            <option value="trueDmg">True Damage</option><option value="guardBreak">Guard Crush</option>
          </select>
        </>
      )}
      {value.c === 'res' && (
        <select value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value as 'self' | 'enemy' })}>
          <option value="self">you</option><option value="enemy">opponent</option>
        </select>
      )}
      {value.c === 'silenced' && (
        <select value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value as 'self' | 'enemy' })}>
          <option value="enemy">opponent</option><option value="self">you</option>
        </select>
      )}
      {value.c === 'hp' && (
        <>
          <select value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value as 'self' | 'enemy' })}>
            <option value="self">your HP</option><option value="enemy">opponent's HP</option>
          </select>
          <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as typeof value.op })}>
            <option value="<">&lt;</option><option value="<=">≤</option><option value=">">&gt;</option><option value=">=">≥</option>
          </select>
        </>
      )}
      {'n' in value && value.c === 'hp' && <Num value={value.n} min={0} onChange={(n) => onChange({ ...value, n })} />}
      {value.c === 'hp' && (
        <label className="inline" title="N is a % of Max HP">
          <input type="checkbox" checked={!!value.pct} onChange={(e) => onChange({ ...value, pct: e.target.checked || undefined })} /> % of Max HP
        </label>
      )}
      {(value.c === 'chainHas' || value.c === 'fieldHas') && (
        <select value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value as 'self' | 'enemy' })}>
          <option value="self">you</option><option value="enemy">opponent</option>
        </select>
      )}
      {(value.c === 'chainAll' || value.c === 'chainHas' || value.c === 'prevIs' || value.c === 'facingIs' || value.c === 'fieldHas') && (
        <TypeSelect value={value.type} onChange={(type) => onChange({ ...value, type: type! })} />
      )}
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
          <option value="self">you</option><option value="enemy">opponent</option><option value="both">both</option>
        </select>
      )}
      {value.a === 'status' && (
        <>
          <select
            value={value.kind}
            onChange={(e) => {
              const kind = e.target.value as typeof value.kind
              onChange(kind === 'blockPlus' || kind === 'shield' || kind === 'parry' || kind === 'vulnerable' ? { ...value, kind, n: value.n ?? (kind === 'shield' ? 10 : kind === 'vulnerable' ? 50 : 1) } : { a: 'status', who: value.who, kind, turns: value.turns })
            }}
          >
            <option value="noStrike">can't Strike</option><option value="noBlock">can't Block</option><option value="noCharge">can't Charge</option><option value="silence">Silenced (card effects off)</option>
            <option value="blockPlus">Block stops ±N hits</option><option value="shield">Shield N</option><option value="parry">Parry N hits</option><option value="vulnerable">Vulnerable N% (takes more dmg)</option>
          </select>
          {(value.kind === 'shield' || value.kind === 'parry') && <><Num value={value.n ?? 1} min={1} onChange={(n) => onChange({ ...value, n })} /> {value.kind === 'shield' ? 'points' : 'hit(s)'},</>}
          {value.kind === 'shield' && (
            <select value={value.per ?? ''} onChange={(e) => onChange({ ...value, per: (e.target.value || undefined) as typeof value.per })} title="Multiply by a count">
              <option value="">(flat)</option>
              {Object.entries(PER_LABEL).map(([k, label]) => <option key={k} value={k}>per {label}</option>)}
            </select>
          )}
          {value.kind === 'vulnerable' && <><Num value={value.n ?? 50} min={1} onChange={(n) => onChange({ ...value, n })} /> % more dmg,</>}
          {value.kind === 'blockPlus' && <><Num value={value.n ?? 1} onChange={(n) => onChange({ ...value, n })} /> hit(s) (negative = fewer),</>}
          <Num value={value.turns} min={value.kind === 'shield' ? 0 : 1} onChange={(turns) => onChange({ ...value, turns })} /> turn(s)
        </>
      )}
      {(value.a === 'addDmg' || value.a === 'mulDmg') && (
        <>
          <select
            value={typeof value.target === 'object' ? ('enemySlot' in value.target ? 'enemySlot' : 'slot') : value.target}
            onChange={(e) => {
              const v = e.target.value
              onChange({ ...value, target: v === 'slot' ? { slot: 1 } : v === 'enemySlot' ? { enemySlot: 1 } : (v as 'this') })
            }}
          >
            <option value="this">this card</option><option value="next">next card</option><option value="following">all following</option>
            <option value="slot">slot…</option><option value="facing">facing card</option><option value="enemyAll">all opponent's cards</option>
            <option value="enemySlot">opponent's slot…</option>
          </select>
          {typeof value.target === 'object' && 'slot' in value.target && <Num value={value.target.slot} min={1} onChange={(slot) => onChange({ ...value, target: { slot } })} />}
          {typeof value.target === 'object' && 'enemySlot' in value.target && <Num value={value.target.enemySlot} min={1} onChange={(enemySlot) => onChange({ ...value, target: { enemySlot } })} />}
          <TypeSelect value={value.onlyType} allowAny onChange={(onlyType) => onChange({ ...value, onlyType })} />
        </>
      )}
      {value.a === 'grow' && (
        <select value={value.dur} onChange={(e) => onChange({ ...value, dur: e.target.value as 'next' | 'game' })} title="Duration">
          <option value="next">next attack only</option><option value="game">rest of game</option>
        </select>
      )}
      {value.a === 'grow' && (
        <label className="inline">
          <input type="checkbox" checked={!!value.stack} onChange={(e) => onChange({ ...value, stack: e.target.checked || undefined })} /> stacks
        </label>
      )}
      {value.a === 'pierce' && (
        <select value={value.target} onChange={(e) => onChange({ ...value, target: e.target.value as typeof value.target })}>
          <option value="this">this card</option><option value="next">next card</option><option value="following">all following</option><option value="chain">whole chain</option>
        </select>
      )}
      {value.a === 'cut' && (
        <select value={value.which} onChange={(e) => onChange({ ...value, which: e.target.value as typeof value.which })}>
          <option value="oldest">oldest</option><option value="newest">newest</option><option value="facing">card in this slot</option>
        </select>
      )}
      {value.a === 'mulDmg' && <><Num value={value.pct} min={0} onChange={(pct) => onChange({ ...value, pct })} />%</>}
      {'n' in value && value.a !== 'status' && <Num value={value.n} min={value.a === 'addDmg' || value.a === 'maxHp' || value.a === 'grow' || value.a === 'blockNow' || value.a === 'gainRes' ? undefined : value.a === 'cut' ? 1 : 0} onChange={(n) => onChange({ ...value, n })} />}
      {(value.a === 'draw' || value.a === 'heal' || value.a === 'loseHp' || value.a === 'addDmg' || value.a === 'gainRes') && (
        <select value={value.per ?? ''} onChange={(e) => onChange({ ...value, per: (e.target.value || undefined) as typeof value.per })} title="Multiply by a count">
          <option value="">(flat)</option>
          {Object.entries(PER_LABEL).map(([k, label]) => <option key={k} value={k}>per {label}</option>)}
        </select>
      )}
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
      {props.allowAny && <option value="">any type</option>}
      <option value="P">Punch</option><option value="K">Kick</option><option value="S">Skill</option>
    </select>
  )
}

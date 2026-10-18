// Number form for one tuning group (engine/tuning.ts): a Champion's class numbers or one Style's.
// params keeps only the numbers that differ from the default, so an untouched field follows the code default.
import { fillText, isTuningGroup, TUNING_FIELDS, unknownPlaceholders, type Tuning, type TuneField, type TuningGroup, type TuningParams as Params } from '../engine'

export function TuningFields({ group, params, onChange }: { group: TuningGroup; params: Params; onChange: (p: Params) => void }) {
  const fields = TUNING_FIELDS[group] as readonly TuneField[]
  const changed = fields.filter((f) => params[f.key] !== undefined && params[f.key] !== f.def).length

  function set(f: TuneField, raw: string) {
    const next = { ...params }
    const v = Number(raw)
    // blank = follow the code default again (a value equal to the default is dropped on save, see cleanParams)
    if (raw.trim() === '') delete next[f.key]
    else next[f.key] = v
    onChange(next)
  }

  return (
    <div className="tuning">
      <div className="tuning-head">
        <span className="muted">{changed ? `${changed} changed from default` : 'All defaults'}</span>
        {changed > 0 && (
          <button type="button" className="secondary" onClick={() => onChange({})}>
            Reset all
          </button>
        )}
      </div>
      <div className="grid">
        {fields.map((f) => {
          const v = params[f.key]
          const range = [f.min !== undefined && `min ${f.min}`, f.max !== undefined && `max ${f.max}`].filter(Boolean).join(', ')
          return (
            <label key={f.key} className={v !== undefined && v !== f.def ? 'tuned' : undefined} title={[f.help, range].filter(Boolean).join(' · ')}>
              {f.label}
              <span className="tuning-input">
                <input
                  type="number"
                  className="num"
                  step={f.decimal ? 'any' : 1}
                  min={f.min}
                  max={f.max}
                  placeholder={String(f.def)}
                  value={v ?? ''}
                  onChange={(e) => set(f, e.target.value)}
                />
                <span className="muted">default {f.def}</span>
                {v !== undefined && (
                  <button type="button" className="link" onClick={() => set(f, '')} title="Back to default">
                    ↺
                  </button>
                )}
              </span>
              {f.help && <small className="muted">{f.help}</small>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** Under a Style / combo text box: the text as players see it (placeholders filled) and the placeholders it can use. */
export function TextPreview({ text, group, tuning, extra }: { text: string; group: string; tuning: Tuning; extra: Record<string, number> }) {
  const fields = isTuningGroup(group) ? (TUNING_FIELDS[group] as readonly TuneField[]) : []
  const bad = unknownPlaceholders(text, group, Object.keys(extra))
  const filled = fillText(text, group, tuning, extra)
  return (
    <div className="text-preview">
      {filled !== text && (
        <p>
          <span className="muted">Players see: </span>
          {filled}
        </p>
      )}
      {bad.length > 0 && <p className="error">Unknown: {bad.join(' ')}</p>}
      <details>
        <summary className="muted">Numbers you can put in the text</summary>
        <p className="muted">
          {[...fields.map((f) => [f.key, f.label] as const), ...Object.keys(extra).map((k) => [k, k] as const)].map(([k, label]) => (
            <code key={k} title={label}>{`{${k}}`} </code>
          ))}
          <br />
          {'{key|ord}'} = 1st / 2nd / 3rd / 4th · another group: {'{MG.cap}'}, {'{BR:2.conquerorMax}'}
        </p>
      </details>
    </div>
  )
}

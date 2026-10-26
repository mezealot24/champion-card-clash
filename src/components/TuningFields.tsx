// Number form for one tuning group (engine/tuning.ts): a Champion's class numbers or one Style's.
// params keeps only the numbers that differ from the default, so an untouched field follows the code default.
import { fieldsOf, fillText, isTuningGroup, OATHS, TREES, treeShape, unknownPlaceholders, type PieceData, type Tuning, type TuneField, type TuningGroup, type TuningParams as Params } from '../engine'

export function TuningFields({ group, params, onChange }: { group: TuningGroup; params: Params; onChange: (p: Params) => void }) {
  const fields = fieldsOf(group)
  const changed = fields.filter((f) => params[f.key] !== undefined && params[f.key] !== f.def).length

  function set(f: TuneField, raw: string) {
    const next = { ...params }
    const v = Number(raw)
    // blank = follow the code default again (a value equal to the default is dropped on save, see cleanParams)
    if (raw.trim() === '') delete next[f.key]
    else next[f.key] = v
    onChange(next)
  }

  // Ascendancy nodes (Style group) and Oaths (class group) show as cards like the tree players pick from (Q 2026-10-26),
  // each with its own numbers; every other number stays in the plain grid
  const tree = TREES[group]
  const pieces: PieceData[] = tree?.nodes ?? OATHS[group] ?? []
  const pieceKeys = new Set(pieces.flatMap((n) => n.fields.map((x) => x.key)))
  const plain = fields.filter((f) => !pieceKeys.has(f.key))
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const valueOf = (key: string) => params[key] ?? byKey.get(key)?.def ?? 0
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (m, k: string) => (byKey.has(k) ? String(valueOf(k)) : m))

  const input = (f: TuneField, short = false) => {
    const v = params[f.key]
    const range = [f.min !== undefined && `min ${f.min}`, f.max !== undefined && `max ${f.max}`].filter(Boolean).join(', ')
    return (
      <label key={f.key} className={v !== undefined && v !== f.def ? 'tuned' : undefined} title={[f.help, range].filter(Boolean).join(' · ')}>
        {short ? f.label.replace(/^.*?: /, '') : f.label}
        <span className="tuning-input">
          <input
            type="number"
            className="num"
            inputMode={f.decimal || (f.min ?? 0) < 0 ? 'decimal' : 'numeric'}
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
        {!short && f.help && <small className="muted">{f.help}</small>}
      </label>
    )
  }
  const card = (n: PieceData, cap: boolean) => {
    const tuned = n.fields.some((x) => params[x.key] !== undefined && params[x.key] !== x.def)
    return (
      <div key={n.id} className={`tune-node${cap ? ' cap' : ''}${tuned ? ' tuned' : ''}`}>
        <b>
          <em>{cap ? '★' : tree ? n.id[1] : '◆'}</em>
          {n.name}
        </b>
        <p>{fill(n.text)}</p>
        {n.cost && (
          <p className="tune-cost">
            <i>Cost</i> {fill(n.cost)}
          </p>
        )}
        <div className="tune-node-fields">{n.fields.map((x) => byKey.get(x.key)).filter((x): x is TuneField => !!x).map((x) => input(x, true))}</div>
      </div>
    )
  }
  const { letters, depth } = tree ? treeShape(group) : { letters: [] as string[], depth: 0 }

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
      {plain.length > 0 && <div className="grid">{plain.map((f) => input(f))}</div>}
      {tree && (
        <>
          <h4 className="tune-title">Ascendancy</h4>
          <div className="tune-tree asc">
            {tree.branches.map((name, bi) => (
              <div className="tune-branch" key={name}>
                <h5>{name}</h5>
                {tree.nodes.filter((n) => n.id[0] === letters[bi]).map((n) => card(n, Number(n.id[1]) === depth))}
              </div>
            ))}
          </div>
        </>
      )}
      {!tree && pieces.length > 0 && (
        <>
          <h4 className="tune-title">Oaths</h4>
          <div className="tune-tree">{pieces.map((n) => card(n, false))}</div>
        </>
      )}
    </div>
  )
}

/** Under a Style / combo text box: the text as players see it (placeholders filled) and the placeholders it can use. */
export function TextPreview({ text, group, tuning, extra }: { text: string; group: string; tuning: Tuning; extra: Record<string, number> }) {
  const fields = isTuningGroup(group) ? fieldsOf(group) : []
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

// Loadout pieces for the pre-battle steps: the Ascendancy tree of the picked Style (Path step) and the one Sigil, the
// Champion's Oath (Oath step, no Cost). Q 2026-10-25: Sigil II · Minor is off (the engine still knows the Minors, nothing
// offers them); a Style and a full tree are required. Mockup: Game Designer thread (claude.ai/artifact/QWLfQ4bSXFxz6BMXUwQAB6).
// All open in Beta, saved per Champion on every change.
import { fillAsc, OATHS, TREES, treePoints, treeShape, validAsc } from '../../engine'
import type { SavedLoadout } from './loadout'
import './loadout.css'

type Props = {
  champ: string
  saved: SavedLoadout
  onChange: (l: SavedLoadout) => void
  /** fill {placeholders} of a text against a tuning group */
  fill: (text: string, group: string) => string
}

/** The picked Style's tree. Every point must be spent before the next step. */
export function AscTree({ champ, style, points: base, saved, onChange, fill }: Props & { style: string; points: number }) {
  const points = treePoints(style, base)
  const { letters, depth } = treeShape(style)
  const tree = TREES[style]
  const taken = saved.asc?.[style] ?? []
  const setAsc = (ids: string[]) => onChange({ ...saved, asc: { ...saved.asc, [style]: ids } })
  if (!tree) return <p className="lo-note">This Style has no Ascendancy tree yet.</p>

  function toggleNode(id: string) {
    const b = id[0]
    const n = Number(id[1])
    // untaking a node also drops the ones below it in that branch
    if (taken.includes(id)) return setAsc(taken.filter((x) => !(x[0] === b && Number(x[1]) >= n)))
    const next = [...taken, id]
    if (validAsc(next, points, style)) setAsc(next)
  }
  const nodeState = (id: string) => (taken.includes(id) ? 'taken' : validAsc([...taken, id], points, style) ? 'avail' : 'locked')
  const left = points - taken.length

  return (
    <section className="box" aria-label={`${champ} Ascendancy`}>
      <h2>
        Ascendancy <span>{left ? `${left} of ${points} points left` : `all ${points} points spent`}</span>
        <span className="lo-pips" aria-hidden="true">
          {Array.from({ length: points }, (_, i) => (
            <i key={i} className={i < taken.length ? 'on' : undefined} />
          ))}
        </span>
      </h2>
      <p className="lo-note">Spend every point. Take nodes from the top of a branch down. The last node (★) is the capstone: optional, with a Cost. Respec is free.</p>
      <div className="lo-tree">
        {tree.branches.map((name, bi) => {
          const b = letters[bi]
          return (
            <div className="lo-branch" key={b}>
              <h3>{name}</h3>
              {tree.nodes
                .filter((n) => n.id[0] === b)
                .map((n) => {
                  const st = nodeState(n.id)
                  const cap = Number(n.id[1]) === depth
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`lo-node ${st}${cap ? ' cap' : ''}`}
                      aria-pressed={st === 'taken'}
                      aria-disabled={st === 'locked'}
                      onClick={() => toggleNode(n.id)}
                    >
                      <b>
                        <em className="lo-tier">{cap ? '★' : n.id[1]}</em>
                        {n.name}
                        <i>{cap ? 'Capstone' : `T${n.id[1]}`}</i>
                      </b>
                      <span>{fill(n.text, style)}</span>
                      {n.cost && (
                        <span className="lo-cost">
                          <i>Cost</i>
                          {fill(n.cost, style)}
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>
      <div className="lo-row">
        <button type="button" className="lo-ghost" onClick={() => setAsc(fillAsc(style, points, taken))} disabled={!left}>
          {taken.length ? 'Fill the rest' : 'Quick build'}
        </button>
        <button type="button" className="lo-ghost" onClick={() => setAsc([])} disabled={!taken.length}>
          Respec (free)
        </button>
      </div>
    </section>
  )
}

/** Sigil · Oath: pick one of the Champion's Oaths. */
export function OathPicker({ champ, champName, saved, onChange, fill }: Props & { champName: string }) {
  return (
    <section className="box">
      <h2>
        Sigil · Oath <span>{champName} only · pick one</span>
      </h2>
      <div className="lo-opts">
        {(OATHS[champ] ?? []).map((o) => {
          const on = saved.oath === o.id
          return (
            <button key={o.id} type="button" className={`lo-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange({ ...saved, oath: o.id })}>
              <b>
                {o.name}
                {on && <i className="lo-check">✓</i>}
              </b>
              <span className="lo-line up">
                <i>Boon</i>
                {fill(o.text, champ)}
              </span>
              {o.cost && (
                <span className="lo-line down">
                  <i>Cost</i>
                  {fill(o.cost, champ)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

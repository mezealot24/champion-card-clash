// Loadout screen: Sigil I · Oath (Boon + Cost), Sigil II · Minor, and the Ascendancy tree of the picked Style.
// Mockup: Game Designer thread (claude.ai/artifact/QWLfQ4bSXFxz6BMXUwQAB6). All open in Beta, saved per Champion.
import { useState } from 'react'
import { MINORS, OATHS, TREES, validAsc, type PieceData } from '../../engine'
import { champColor } from '../fighters'
import { loadLoadout, saveLoadout, type SavedLoadout } from './loadout'
import './loadout.css'

export function LoadoutBuilder(props: {
  champ: string
  champName: string
  /** "CHAMP:slot", or undefined when playing without a Style */
  style?: string
  styleName?: string
  points: number
  /** fill {placeholders} of a text against a tuning group */
  fill: (text: string, group: string) => string
  onClose: () => void
}) {
  const { champ, style, points, fill } = props
  const [l, setL] = useState<SavedLoadout>(() => loadLoadout(champ))
  const oaths = OATHS[champ] ?? []
  const tree = style ? TREES[style] : undefined
  const taken = (style && l.asc?.[style]) || []
  const setAsc = (ids: string[]) => style && setL({ ...l, asc: { ...l.asc, [style]: ids } })

  function toggleNode(id: string) {
    const b = id[0]
    const n = Number(id[1])
    // untaking a node also drops the ones below it in that branch
    if (taken.includes(id)) return setAsc(taken.filter((x) => !(x[0] === b && Number(x[1]) >= n)))
    const next = [...taken, id]
    if (validAsc(next, points)) setAsc(next)
  }
  const nodeState = (id: string) => (taken.includes(id) ? 'taken' : validAsc([...taken, id], points) ? 'avail' : 'locked')

  const pick = (p: PieceData, group: string, on: boolean, onPick: () => void) => (
    <button key={p.id} type="button" className={`lo-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={onPick}>
      <b>{p.name}</b>
      <span className="lo-line up">
        <i>Boon</i>
        {fill(p.text, group)}
      </span>
      {p.cost && (
        <span className="lo-line down">
          <i>Cost</i>
          {fill(p.cost, group)}
        </span>
      )}
    </button>
  )

  return (
    <div className="select lo" style={{ '--tint': champColor(champ) } as React.CSSProperties}>
      <header className="lo-head">
        <h1>
          <small>Loadout</small>
          {props.champName}
        </h1>
        <span className="lo-beta">Beta: everything open</span>
      </header>

      <section className="box">
        <h2>
          Ascendancy <span>{style ? `${props.styleName ?? style} · ${taken.length} / ${points} points` : 'needs a Style'}</span>
        </h2>
        {!tree ? (
          <p className="lo-note">Pick a Style on the Champion screen to grow its tree.</p>
        ) : (
          <>
            <p className="lo-note">Take nodes from the top of a branch down. Node 4 is the capstone. Respec is free.</p>
            <div className="lo-tree">
              {tree.branches.map((name, bi) => {
                const b = bi === 0 ? 'A' : 'B'
                return (
                  <div className="lo-branch" key={b}>
                    <h3>{name}</h3>
                    {tree.nodes
                      .filter((n) => n.id[0] === b)
                      .map((n) => {
                        const st = nodeState(n.id)
                        return (
                          <button
                            key={n.id}
                            type="button"
                            className={`lo-node ${st}${n.id[1] === '4' ? ' cap' : ''}`}
                            aria-pressed={st === 'taken'}
                            aria-disabled={st === 'locked'}
                            onClick={() => toggleNode(n.id)}
                          >
                            <b>
                              {n.name}
                              <i>{n.id[1] === '4' ? 'Capstone' : `T${n.id[1]}`}</i>
                            </b>
                            <span>{fill(n.text, style!)}</span>
                          </button>
                        )
                      })}
                  </div>
                )
              })}
            </div>
            <button type="button" className="lo-ghost" onClick={() => setAsc([])} disabled={!taken.length}>
              Respec (free)
            </button>
          </>
        )}
      </section>

      <section className="box">
        <h2>
          Sigil I · Oath <span>{props.champName} only · Boon + Cost</span>
        </h2>
        <div className="lo-opts">
          {oaths.map((o) => pick(o, champ, l.oath === o.id, () => setL({ ...l, oath: l.oath === o.id ? undefined : o.id })))}
        </div>
      </section>

      <section className="box">
        <h2>
          Sigil II · Minor <span>shared · small bonus</span>
        </h2>
        <div className="lo-opts">
          {MINORS.map((m) => pick(m, 'MINOR', l.minor === m.id, () => setL({ ...l, minor: l.minor === m.id ? undefined : m.id })))}
        </div>
      </section>

      <footer className="lo-foot">
        <div>
          <button type="button" className="lo-ghost" onClick={() => setL({})}>
            Clear all
          </button>
          <button type="button" className="lo-ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="start"
            onClick={() => {
              saveLoadout(champ, l)
              props.onClose()
            }}
          >
            Save loadout
          </button>
        </div>
      </footer>
    </div>
  )
}

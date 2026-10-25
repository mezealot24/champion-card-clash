// Loadout screen: one Sigil (the Champion's Oath, no Cost) and the Ascendancy tree of the picked Style.
// Q 2026-10-25: Sigil II · Minor is off (the engine still knows the Minors, nothing offers them).
// Mockup: Game Designer thread (claude.ai/artifact/QWLfQ4bSXFxz6BMXUwQAB6). All open in Beta, saved per Champion.
import { useState } from 'react'
import { OATHS, TREES, treePoints, treeShape, validAsc, type PieceData } from '../../engine'
import { champColor } from '../fighters'
import { Portrait } from '../select/Portrait'
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
  const { champ, style, fill } = props
  const points = treePoints(style, props.points)
  const { letters, depth } = treeShape(style)
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
    if (validAsc(next, points, style)) setAsc(next)
  }
  const nodeState = (id: string) => (taken.includes(id) ? 'taken' : validAsc([...taken, id], points, style) ? 'avail' : 'locked')

  const pick = (p: PieceData, group: string, on: boolean, onPick: () => void) => (
    <button key={p.id} type="button" className={`lo-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={onPick}>
      <b>
        {p.name}
        {on && <i className="lo-check">✓</i>}
      </b>
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
        <Portrait champ={champ} style={style} bust className="head-art" />
        <h1>
          <small>Loadout</small>
          {props.champName}
          {props.styleName && <span className="head-style">{props.styleName}</span>}
        </h1>
        <span className="lo-beta">Beta: everything open</span>
      </header>

      <section className="box">
        <h2>
          Ascendancy <span>{style ? `${taken.length} / ${points} points` : 'needs a Style'}</span>
          {tree && (
            <span className="lo-pips" aria-hidden="true">
              {Array.from({ length: points }, (_, i) => (
                <i key={i} className={i < taken.length ? 'on' : undefined} />
              ))}
            </span>
          )}
        </h2>
        {!tree ? (
          <p className="lo-note">Pick a Style on the Champion screen to grow its tree.</p>
        ) : (
          <>
            <p className="lo-note">Take nodes from the top of a branch down. The last node (★) is the capstone: optional, with a Cost. Respec is free.</p>
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
                            <span>{fill(n.text, style!)}</span>
                            {n.cost && (
                              <span className="lo-cost">
                                <i>Cost</i>
                                {fill(n.cost, style!)}
                              </span>
                            )}
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
          Sigil · Oath <span>{props.champName} only · pick one</span>
        </h2>
        <div className="lo-opts">
          {oaths.map((o) => pick(o, champ, l.oath === o.id, () => setL({ ...l, oath: l.oath === o.id ? undefined : o.id })))}
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

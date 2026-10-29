// Loadout pieces for the pre-battle steps: the Ascendancy tree of the picked Style (Path step) and the one Sigil, the
// Champion's Oath (Oath step, no Cost). Q 2026-10-25: Sigil II · Minor is off (the engine still knows the Minors, nothing
// offers them); a Style and a full tree are required. Mockup: Game Designer thread (claude.ai/artifact/QWLfQ4bSXFxz6BMXUwQAB6).
// All open in Beta, saved per Champion on every change.
import { fillAsc, OATHS, TREES, treePoints, treeShape, validAsc } from '../../engine'
import { useId, useState } from 'react'
import { t, useLang } from '../../i18n'
import { Portrait } from '../select/Portrait'
import { RichList } from './RichText'
import type { SavedLoadout } from './loadout'
import './loadout.css'

type Props = {
  champ: string
  saved: SavedLoadout
  onChange: (l: SavedLoadout) => void
  /** fill {placeholders} of a text against a tuning group */
  fill: (text: string, group: string) => string
}

/** The picked Style's tree, drawn as a skill tree (Q 2026-10-29): the Style crest on top, one column per branch, passives
 * (round) then the keystone (◆, the capstone with a Cost) at the bottom. Tap a node to read it in the panel below, tap it
 * again (or press Learn) to take it. Every point must be spent before the next step. */
export function AscTree({ champ, style, points: base, saved, onChange, fill }: Props & { style: string; points: number }) {
  useLang()
  const uid = useId().replace(/:/g, '')
  const points = treePoints(style, base)
  const { letters, depth, maxCapstones } = treeShape(style)
  const tree = TREES[style]
  const taken = saved.asc?.[style] ?? []
  const setAsc = (ids: string[]) => onChange({ ...saved, asc: { ...saved.asc, [style]: ids } })
  const nodeState = (id: string) => (taken.includes(id) ? 'taken' : validAsc([...taken, id], points, style) ? 'avail' : 'locked')
  const [focusPick, setFocus] = useState<string>()
  if (!tree) return <p className="lo-note">{t('This Style has no Ascendancy tree yet.')}</p>
  const focus = tree.nodes.find((n) => n.id === focusPick) ?? tree.nodes.find((n) => nodeState(n.id) === 'avail') ?? tree.nodes[0]
  const left = points - taken.length

  function take(id: string) {
    const next = [...taken, id]
    if (validAsc(next, points, style)) setAsc(next)
  }
  // refunding a node also drops the ones below it in that branch
  const refund = (id: string) => setAsc(taken.filter((x) => !(x[0] === id[0] && Number(x[1]) >= Number(id[1]))))
  function tap(id: string) {
    if (id === focus.id && nodeState(id) === 'avail') take(id)
    setFocus(id)
  }

  // layout in a 400-wide viewBox: crest, a spine, then one column per branch
  const W = 400
  const colX = (bi: number) => (W / letters.length) * (bi + 0.5)
  const gap = depth > 3 ? 66 : 80
  const rowY = (n: number) => 146 + (n - 1) * gap
  const H = rowY(depth) + 66
  const isKey = (id: string) => Number(id[1]) === depth
  const rOf = (id: string) => (isKey(id) ? 28 : 20)
  const SPINE = 74

  const focusState = nodeState(focus.id)
  const prev = tree.nodes.find((n) => n.id === `${focus.id[0]}${Number(focus.id[1]) - 1}`)
  const keysTaken = taken.filter(isKey).length
  const why =
    focusState !== 'locked'
      ? ''
      : prev && !taken.includes(prev.id)
        ? t('Learn {name} first.', { name: prev.name })
        : left <= 0
          ? t('No points left. Refund a node first.')
          : isKey(focus.id) && keysTaken >= maxCapstones
            ? t('One keystone per tree. Refund the other first.')
            : ''
  const below = taken.filter((x) => x[0] === focus.id[0] && Number(x[1]) > Number(focus.id[1])).length

  return (
    <section className="box at" aria-label={`${champ} Ascendancy`}>
      <h2>
        {t('Ascendancy')} <span>{left ? t('{left} of {n} points left', { left, n: points }) : t('all {n} points spent', { n: points })}</span>
        <span className="at-gems" aria-hidden="true">
          {Array.from({ length: points }, (_, i) => (
            <i key={i} className={i < taken.length ? 'on' : undefined} />
          ))}
        </span>
      </h2>
      <p className="lo-note">
        {t(
          maxCapstones === 1
            ? 'Tap a node to read it, tap again to learn it. Learn each branch from the top down. The ◆ keystone at the end is optional, has a Cost, and only one fits per tree. Respec is free.'
            : 'Tap a node to read it, tap again to learn it. Learn each branch from the top down. The ◆ keystone at the end is optional and has a Cost. Respec is free.',
        )}
      </p>

      <div className="at-graph">
        <span className="at-crest" style={{ top: `${(34 / H) * 100}%` }} aria-hidden="true">
          <Portrait champ={champ} style={style} bust />
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t('Ascendancy')}>
          <defs>
            <radialGradient id={`${uid}-lit`} cx="50%" cy="35%" r="70%">
              <stop offset="0%" className="at-stop-hi" />
              <stop offset="100%" className="at-stop-lo" />
            </radialGradient>
            <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {/* connectors: crest → spine → each branch, then down the branch */}
          {[...letters].map((b, bi) => {
            const x = colX(bi)
            const dir = Math.sign(x - W / 2)
            const top = `M ${W / 2} 58 V ${SPINE - 8} Q ${W / 2} ${SPINE} ${W / 2 + dir * 8} ${SPINE} H ${x - dir * 8} Q ${x} ${SPINE} ${x} ${SPINE + 8} V ${rowY(1) - rOf(`${b}1`)}`
            const lit = taken.includes(`${b}1`)
            return (
              <g key={b}>
                <path d={top} className={`at-wire${lit ? ' lit' : nodeState(`${b}1`) === 'avail' ? ' next' : ''}`} />
                {Array.from({ length: depth - 1 }, (_, i) => {
                  const a = `${b}${i + 1}`
                  const c = `${b}${i + 2}`
                  return (
                    <path
                      key={c}
                      d={`M ${x} ${rowY(i + 1) + rOf(a)} V ${rowY(i + 2) - rOf(c)}`}
                      className={`at-wire${taken.includes(c) ? ' lit' : nodeState(c) === 'avail' ? ' next' : ''}`}
                    />
                  )
                })}
              </g>
            )
          })}
          {/* branch names sit on the wire */}
          {tree.branches.map((name, bi) => (
            <g key={name} className={`at-branch${taken.some((x) => x[0] === letters[bi]) ? ' on' : ''}`}>
              <rect x={colX(bi) - 46} y={SPINE + 14} width={92} height={20} rx={10} />
              <text x={colX(bi)} y={SPINE + 28}>
                {name}
              </text>
            </g>
          ))}
          {tree.nodes.map((n) => {
            const bi = letters.indexOf(n.id[0])
            const x = colX(bi)
            const y = rowY(Number(n.id[1]))
            const st = nodeState(n.id)
            const key = isKey(n.id)
            const r = rOf(n.id)
            const label = wrap(n.name)
            return (
              <g
                key={n.id}
                className={`at-node ${key ? 'key' : 'pas'} ${st}${focus.id === n.id ? ' focus' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={st === 'taken'}
                aria-label={`${n.name}, ${key ? t('Keystone') : t('Passive · Tier {n}', { n: n.id[1] })}, ${t(st === 'taken' ? 'learned' : st === 'avail' ? 'can learn' : 'locked')}`}
                onClick={() => tap(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    tap(n.id)
                  }
                }}
              >
                <rect className="at-hit" x={x - 48} y={y - r - 6} width={96} height={r * 2 + 40} />
                {st === 'taken' && (key ? <path d={diamond(x, y, r + 4)} className="at-halo" filter={`url(#${uid}-glow)`} /> : <circle cx={x} cy={y} r={r + 4} className="at-halo" filter={`url(#${uid}-glow)`} />)}
                {focus.id === n.id && (key ? <path d={diamond(x, y, r + 9)} className="at-ring" /> : <circle cx={x} cy={y} r={r + 7} className="at-ring" />)}
                {key ? (
                  <>
                    <path d={diamond(x, y, r)} className="at-frame" />
                    <path d={diamond(x, y, r - 6)} className="at-core" style={st === 'taken' ? { fill: `url(#${uid}-lit)` } : undefined} />
                    <path d={star(x, y, 9)} className="at-glyph" />
                  </>
                ) : (
                  <>
                    <circle cx={x} cy={y} r={r} className="at-frame" />
                    <circle cx={x} cy={y} r={r - 5} className="at-core" style={st === 'taken' ? { fill: `url(#${uid}-lit)` } : undefined} />
                    <text x={x} y={y + 4.5} className="at-tier">
                      {n.id[1] === '1' ? 'I' : n.id[1] === '2' ? 'II' : 'III'}
                    </text>
                  </>
                )}
                <text x={x} y={y + r + 15} className="at-name">
                  {label.map((l, i) => (
                    <tspan key={i} x={x} dy={i ? 12 : 0}>
                      {l}
                    </tspan>
                  ))}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className={`at-detail ${isKey(focus.id) ? 'key' : 'pas'} ${focusState}`} aria-live="polite">
        <div className="at-head">
          <span className="at-kind">{isKey(focus.id) ? `◆ ${t('Keystone')}` : t('Passive · Tier {n}', { n: focus.id[1] })} · {tree.branches[letters.indexOf(focus.id[0])]}</span>
          <b>{focus.name}</b>
        </div>
        <RichList text={fill(t(focus.text), style)} />
        {focus.cost && (
          <div className="at-cost">
            <i>{t('Cost')}</i>
            <RichList text={fill(t(focus.cost), style)} />
          </div>
        )}
        <div className="at-foot">
          {focusState === 'taken' ? (
            <>
              <span className="at-tag ok">✓ {t('Learned')}</span>
              <button type="button" className="lo-ghost" onClick={() => refund(focus.id)}>
                {below ? t('Refund (and {n} below)', { n: below }) : t('Refund')}
              </button>
            </>
          ) : focusState === 'avail' ? (
            <button type="button" className="at-learn" onClick={() => take(focus.id)}>
              {t('Learn · 1 point')}
            </button>
          ) : (
            <span className="at-tag">🔒 {why || t('Locked')}</span>
          )}
        </div>
      </div>

      <div className="lo-row">
        <button type="button" className="lo-ghost" onClick={() => setAsc(fillAsc(style, points, taken))} disabled={!left}>
          {taken.length ? t('Fill the rest') : t('Quick build')}
        </button>
        <button type="button" className="lo-ghost" onClick={() => setAsc([])} disabled={!taken.length}>
          {t('Respec (free)')}
        </button>
      </div>
    </section>
  )
}

/** A node name on at most 2 lines under its node. */
function wrap(name: string): string[] {
  if (name.length <= 12 || !name.includes(' ')) return [name]
  const words = name.split(' ')
  let best = [name]
  let score = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const s = Math.max(a.length, b.length)
    if (s < score) [best, score] = [[a, b], s]
  }
  return best
}

const diamond = (x: number, y: number, r: number) => `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`
const star = (x: number, y: number, r: number) =>
  Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 4) * i - Math.PI / 2
    const d = i % 2 ? r * 0.38 : r
    return `${i ? 'L' : 'M'} ${(x + d * Math.cos(a)).toFixed(1)} ${(y + d * Math.sin(a)).toFixed(1)}`
  }).join(' ') + ' Z'

/** Sigil · Oath: pick one of the Champion's Oaths. */
export function OathPicker({ champ, champName, saved, onChange, fill }: Props & { champName: string }) {
  useLang()
  return (
    <section className="box">
      <h2>
        {t('Sigil · Oath')} <span>{t('{name} only · pick one', { name: champName })}</span>
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
                <i>{t('Boon')}</i>
                <RichList text={fill(t(o.text), champ)} />
              </span>
              {o.cost && (
                <span className="lo-line down">
                  <i>{t('Cost')}</i>
                  <RichList text={fill(t(o.cost), champ)} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Pre-match screen: pick a Champion and its Style, see in plain words how they play, pick the opponent, start or learn.
// The Loadout block is a placeholder for Sigils + Ascendancy (design/customization-options-2026-10-18.md).
import { useState } from 'react'
import { STYLES, type Side } from '../../engine'
import type { Champ, StyleRow } from '../Battle'
import { champColor, fighterHTML } from '../fighters'
import { tutorialDone } from '../settings'
import { TimerSetting } from '../timer/TurnTimer'
import { ComboLine } from '../tutorial/Tutorial'
import { CHAMP_INFO, comboPattern, STYLE_SUMMARY } from './info'
import './select.css'

export type FoeKind = 'ai' | 'tuktah' | 'online'

export function ChampionSelect(props: {
  champions: Champ[]
  stylesOf: (id: string) => StyleRow[]
  /** full Style rules with numbers filled, by "CHAMP:slot" */
  styleText: Record<string, string>
  /** fill {placeholders} of a text against a tuning group */
  fill: (text: string, group: string) => string
  picks: Record<Side, string>
  setChamp: (side: Side, id: string) => void
  styleKey: (side: Side) => string
  setStyle: (side: Side, key: string) => void
  foe: FoeKind
  setFoe: (f: FoeKind) => void
  canTuktah: boolean
  canOnline: boolean
  deckSize: (id: string) => number
  missing: (id: string) => number
  onStart: () => void
  onTutorial: () => void
}) {
  const { champions, picks, foe } = props
  const me = picks.p1
  const info = CHAMP_INFO[me]
  const champ = champions.find((c) => c.id === me)
  const myStyle = props.styleKey('p1')
  const [full, setFull] = useState<string | null>(null)
  const newPlayer = !tutorialDone()
  const foeName = foe === 'tuktah' ? 'ตุ๊กตา' : 'AI'

  return (
    <div className="select" style={{ '--tint': champColor(me) } as React.CSSProperties}>
      <header className="sel-head">
        <h1>
          <small>Champion Card Clash</small>Choose your Champion
        </h1>
        <button type="button" className={`tut-btn${newPlayer ? ' new' : ''}`} onClick={props.onTutorial}>
          {newPlayer ? 'New here? Play the tutorial' : 'Tutorial'}
        </button>
      </header>

      <div className="roster" role="radiogroup" aria-label="Your Champion">
        {champions.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === me}
            className="champ"
            style={{ '--c': champColor(c.id) } as React.CSSProperties}
            onClick={() => props.setChamp('p1', c.id)}
          >
            <span className="avatar" dangerouslySetInnerHTML={{ __html: fighterHTML(c.id) }} />
            <b>{c.name}</b>
            <span className="role">{CHAMP_INFO[c.id]?.role ?? ''}</span>
            <span className="hp">HP {c.hp_start}</span>
          </button>
        ))}
      </div>

      {champ && (
        <div className="detail">
          <section className="box about">
            <h2>{champ.name}</h2>
            {info && (
              <>
                <ul className="plays">
                  {info.plays.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <dl>
                  <dt>HP</dt>
                  <dd>
                    {champ.hp_start}
                    {champ.hp_max !== champ.hp_start ? ` (max ${champ.hp_max})` : ''}
                  </dd>
                  <dt>Resource</dt>
                  <dd>{props.fill(info.resource, me)}</dd>
                  <dt>Deck</dt>
                  <dd>
                    {props.deckSize(me)} cards{props.missing(me) ? ` · ⚠ ${props.missing(me)} effects not coded yet` : ''}
                  </dd>
                </dl>
                <h3>Signature combo</h3>
                <ComboLine pattern={comboPattern(me)} text={props.fill(info.combo, me)} />
              </>
            )}
          </section>

          <section className="box styles">
            <h2>
              Style <span>pick 1 · your passive</span>
            </h2>
            <div className="style-opts">
              {props.stylesOf(me).map((s) => {
                const key = `${s.champion_id}:${s.slot}`
                const works = !!STYLES[key]
                const summary = STYLE_SUMMARY[key]
                return (
                  <div key={key} className={`style-opt${myStyle === key ? ' on' : ''}`}>
                    <button type="button" aria-pressed={myStyle === key} disabled={!works} onClick={() => props.setStyle('p1', key)}>
                      <b>{s.name}</b>
                      <span>{works ? (summary ? props.fill(summary, key) : props.styleText[key]) : 'Not playable yet'}</span>
                    </button>
                    {works && summary && (
                      <button type="button" className="more" aria-expanded={full === key} onClick={() => setFull(full === key ? null : key)}>
                        {full === key ? 'Hide full rules' : 'Full rules'}
                      </button>
                    )}
                    {full === key && <p className="full">{props.styleText[key]}</p>}
                  </div>
                )
              })}
            </div>
            <button type="button" className={`no-style${myStyle === '' ? ' on' : ''}`} onClick={() => props.setStyle('p1', '')}>
              Play without a Style
            </button>
          </section>

          <section className="box loadout" aria-label="Loadout, coming soon">
            <h2>
              Loadout <span>coming soon</span>
            </h2>
            <div className="locked-slots">
              <div>
                <b>Ascendancy</b>
                <span>Upgrade tree for your Style</span>
              </div>
              <div>
                <b>Sigil I · Oath</b>
                <span>Big boon, with a cost</span>
              </div>
              <div>
                <b>Sigil II · Minor</b>
                <span>Small shared bonus</span>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="box match">
        <div className="vs-row">
          <label>
            Opponent
            <select value={foe} onChange={(e) => props.setFoe(e.target.value as FoeKind)}>
              <option value="ai">AI</option>
              <option value="tuktah" disabled={!props.canTuktah}>
                ตุ๊กตา (Claude){props.canTuktah ? '' : ' · open on claude.ai'}
              </option>
              <option value="online" disabled={!props.canOnline}>
                Online 1v1{props.canOnline ? '' : ' · open on claude.ai'}
              </option>
            </select>
          </label>
          {foe !== 'online' && (
            <>
              <label>
                {foeName}'s Champion
                <select value={picks.p2} onChange={(e) => props.setChamp('p2', e.target.value)}>
                  {champions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {foeName}'s Style
                <select value={props.styleKey('p2')} onChange={(e) => props.setStyle('p2', e.target.value)}>
                  <option value="">No Style</option>
                  {props.stylesOf(picks.p2).map((s) => {
                    const key = `${s.champion_id}:${s.slot}`
                    return (
                      <option key={key} value={key} disabled={!STYLES[key]}>
                        {s.name}
                      </option>
                    )
                  })}
                </select>
              </label>
            </>
          )}
        </div>
        <TimerSetting />
        <button type="button" className="start" onClick={props.onStart}>
          {foe === 'online' ? 'Find a match' : 'Fight!'}
        </button>
      </section>
    </div>
  )
}

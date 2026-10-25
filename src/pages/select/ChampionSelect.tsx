// Pre-match screen: pick a Champion and its Style, see in plain words how they play, pick the opponent, start or learn.
// The Loadout block shows the Sigils + Ascendancy picked on the Loadout screen (design/customization-options-2026-10-18.md).
import { useState } from 'react'
import { STYLES, type Side } from '../../engine'
import type { Champ, StyleRow } from '../Battle'
import { champColor, spriteClassOf } from '../fighters'
import { tutorialDone } from '../settings'
import { TimerSetting } from '../timer/TurnTimer'
import { ComboLine } from '../tutorial/Tutorial'
import { CHAMP_INFO, comboPattern, STYLE_SUMMARY } from './info'
import { Portrait } from './Portrait'
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
  /** the player's own deck is used for this Champion */
  deckCustom: (id: string) => boolean
  /** a deck is saved for this Champion (it may not fit the picked Style) */
  deckSaved: (id: string) => boolean
  onEditDeck: () => void
  /** the player's Sigils + Ascendancy for this Champion and Style, as short lines */
  loadout: { label: string; value: string }[]
  onEditLoadout: () => void
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
  const foeName = foe === 'tuktah' ? 'Tuktah' : 'AI'
  const styles = props.stylesOf(me)
  // a Style with its own art (Mage) shows it on its card; the others share the Champion's art, so skip it there
  const styleArt = styles.some((s) => spriteClassOf(me, `${s.champion_id}:${s.slot}`) !== spriteClassOf(me))
  const loadoutOf = (label: string) => props.loadout.find((l) => l.label === label)?.value
  const foeChamp = champions.find((c) => c.id === picks.p2)?.name ?? picks.p2
  const foeStyle = props.styleKey('p2')

  return (
    <div className="select" style={{ '--tint': champColor(me) } as React.CSSProperties}>
      <header className="sel-head">
        <small>Champion Card Clash</small>
        <button type="button" className={`tut-btn${newPlayer ? ' new' : ''}`} onClick={props.onTutorial}>
          {newPlayer ? 'New here? Play the tutorial' : 'Tutorial'}
        </button>
      </header>

      {champ && (
        <section className="hero">
          <Portrait champ={me} style={myStyle} className="hero-art" />
          <div className="hero-info">
            <small>Choose your Champion</small>
            <h1>{champ.name}</h1>
            {info && <p className="hero-role">{info.role}</p>}
            <ul className="chips">
              <li>
                <i>HP</i>
                {champ.hp_start}
                {champ.hp_max !== champ.hp_start ? ` / ${champ.hp_max}` : ''}
              </li>
              {info && <li>{props.fill(info.resource, me)}</li>}
            </ul>
          </div>
        </section>
      )}

      <div className="roster" role="radiogroup" aria-label="Your Champion">
        {champions.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === me}
            aria-label={c.name}
            className="champ"
            style={{ '--c': champColor(c.id) } as React.CSSProperties}
            onClick={() => props.setChamp('p1', c.id)}
          >
            <Portrait champ={c.id} style={c.id === me ? myStyle : undefined} bust />
            <b>{c.name}</b>
          </button>
        ))}
      </div>

      {champ && (
        <>
          <section className="box styles">
            <h2>
              Style <span>pick 1 · your passive</span>
            </h2>
            <div className="style-opts">
              {styles.map((s) => {
                const key = `${s.champion_id}:${s.slot}`
                const works = !!STYLES[key]
                const summary = STYLE_SUMMARY[key]
                return (
                  <div key={key} className={`style-opt${myStyle === key ? ' on' : ''}${styleArt ? ' has-art' : ''}`}>
                    <button type="button" aria-pressed={myStyle === key} disabled={!works} onClick={() => props.setStyle('p1', key)}>
                      {styleArt && <Portrait champ={me} style={key} bust className="style-art" />}
                      <span className="style-txt">
                        <b>{s.name}</b>
                        <span>{works ? (summary ? props.fill(summary, key) : props.styleText[key]) : 'Not playable yet'}</span>
                      </span>
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

          <section className="box prep">
            <button type="button" className="prep-row" onClick={props.onEditLoadout}>
              <span className="prep-k">Loadout</span>
              <span className="prep-v">
                {props.loadout.length ? (
                  <>
                    {loadoutOf('Oath') && <b>{loadoutOf('Oath')}</b>}
                    {loadoutOf('Minor') && <b>{loadoutOf('Minor')}</b>}
                    {loadoutOf('Ascendancy') && <span>Ascendancy: {loadoutOf('Ascendancy')}</span>}
                  </>
                ) : (
                  <span>Sigils + Ascendancy · nothing picked yet</span>
                )}
              </span>
              <span className="prep-go">Edit</span>
            </button>
            <button type="button" className="prep-row" onClick={props.onEditDeck}>
              <span className="prep-k">Deck</span>
              <span className="prep-v">
                <b>{props.deckSize(me)} cards</b>
                <span>
                  {props.deckCustom(me) ? 'your deck' : props.deckSaved(me) ? 'default (your deck needs fixing)' : 'default'}
                  {props.missing(me) ? ` · ⚠ ${props.missing(me)} effects not coded yet` : ''}
                </span>
              </span>
              <span className="prep-go">Edit</span>
            </button>
          </section>

          {info && (
            <details className="box how">
              <summary>
                How {champ.name} plays
                <span className="combo-line">
                  <span className="pks">
                    {comboPattern(me).map((t, i) => (
                      <i key={i} className={`t-${t}`}>
                        {t}
                      </i>
                    ))}
                  </span>
                </span>
              </summary>
              <ul className="plays">
                {info.plays.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <h3>Signature combo</h3>
              <ComboLine pattern={comboPattern(me)} text={props.fill(info.combo, me)} />
            </details>
          )}
        </>
      )}

      <section className="box match">
        <h2>
          Opponent <span>{foe === 'online' ? 'a real player' : `${foeName} · ${foeChamp}${foeStyle ? ` · ${STYLES[foeStyle]?.name ?? foeStyle}` : ''}`}</span>
        </h2>
        <div className="vs-row">
          <label>
            Play against
            <select value={foe} onChange={(e) => props.setFoe(e.target.value as FoeKind)}>
              <option value="ai">AI</option>
              <option value="tuktah" disabled={!props.canTuktah}>
                Tuktah (Claude){props.canTuktah ? '' : ' · open on claude.ai'}
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
                <select value={foeStyle} onChange={(e) => props.setStyle('p2', e.target.value)}>
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
      </section>

      <footer className="sel-foot">
        {foe !== 'online' && <Portrait champ={picks.p2} style={foeStyle} bust className="foe-art" />}
        <button type="button" className="start" onClick={props.onStart}>
          {foe === 'online' ? 'Find a match' : 'Fight!'}
        </button>
      </footer>
    </div>
  )
}

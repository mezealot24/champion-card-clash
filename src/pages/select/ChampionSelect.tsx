// Pre-match steps, in order (Q 2026-10-25): Champion → Path (Style + its Ascendancy tree) → Oath → Deck → Fight.
// A Style and a full tree are required (no "no Style"), and so is an Oath; a step opens only when the ones before it are set.
// Loadout pieces: design/customization-options-2026-10-18.md. Picks are saved per Champion on every change.
import { useState } from 'react'
import { STYLES, TREES, type Side } from '../../engine'
import type { Champ, StyleRow } from '../Battle'
import { champColor, spriteClassOf } from '../fighters'
import { loadoutGaps, STEPS, type SavedLoadout, type Step } from '../loadout/loadout'
import { AscTree, OathPicker } from '../loadout/LoadoutParts'
import { tutorialDone } from '../settings'
import { TimerSetting } from '../timer/TurnTimer'
import { ComboLine } from '../tutorial/Tutorial'
import { CHAMP_INFO, comboPattern, STYLE_SUMMARY } from './info'
import { Portrait } from './Portrait'
import './select.css'

export type FoeKind = 'ai' | 'tuktah' | 'online'

const STEP_NAME: Record<Step, string> = { champion: 'Champion', path: 'Path', oath: 'Oath', deck: 'Deck', fight: 'Fight' }

export function ChampionSelect(props: {
  champions: Champ[]
  stylesOf: (id: string) => StyleRow[]
  /** full Style rules with numbers filled, by "CHAMP:slot" */
  styleText: Record<string, string>
  /** fill {placeholders} of a text against a tuning group */
  fill: (text: string, group: string) => string
  picks: Record<Side, string>
  setChamp: (side: Side, id: string) => void
  /** p1: the saved Style ('' until picked); p2: the AI's Style */
  styleKey: (side: Side) => string
  setStyle: (side: Side, key: string) => void
  step: Step
  setStep: (s: Step) => void
  /** the player's saved loadout for the picked Champion */
  saved: SavedLoadout
  setSaved: (l: SavedLoadout) => void
  /** game_config asc_points (a tree may add its own bonus) */
  points: number
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
  /** the player's Oath + Ascendancy for this Champion and Style, as short lines */
  loadout: { label: string; value: string }[]
  missing: (id: string) => number
  onStart: () => void
  onTutorial: () => void
}) {
  const { champions, picks, foe, step, setStep } = props
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

  const gaps = loadoutGaps(me, myStyle || undefined, props.points, props.saved)
  const done: Record<Step, boolean> = { champion: !!champ, path: !gaps.style && gaps.asc === 0, oath: !gaps.oath, deck: true, fight: true }
  const at = STEPS.indexOf(step)
  // a step opens when every step before it is done
  const open = (s: Step) => STEPS.slice(0, STEPS.indexOf(s)).every((p) => done[p])
  const next = STEPS[at + 1]
  const blocker =
    step === 'path' ? (gaps.style ? 'Pick a Style' : gaps.asc > 0 ? `Spend ${gaps.asc} more Ascendancy point${gaps.asc > 1 ? 's' : ''}` : '')
    : step === 'oath' && gaps.oath ? 'Pick an Oath'
    : ''

  return (
    <div className="select" style={{ '--tint': champColor(me) } as React.CSSProperties}>
      <header className="sel-head">
        <small>Champion Card Clash</small>
        <button type="button" className={`tut-btn${newPlayer ? ' new' : ''}`} onClick={props.onTutorial}>
          {newPlayer ? 'New here? Play the tutorial' : 'Tutorial'}
        </button>
      </header>

      <nav className="steps" aria-label="Steps before the fight">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            className={`${s === step ? 'on' : ''}${done[s] && i < at ? ' done' : ''}`}
            aria-current={s === step ? 'step' : undefined}
            disabled={!open(s)}
            onClick={() => setStep(s)}
          >
            <i>{done[s] && i < at ? '✓' : i + 1}</i>
            {STEP_NAME[s]}
          </button>
        ))}
      </nav>

      {step === 'champion' && (
        <>
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

          {champ && info && (
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

      {step === 'path' && champ && (
        <>
          <section className="box styles">
            <h2>
              Path <span>pick 1 Style · your passive</span>
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
          </section>
          {myStyle ? (
            <AscTree champ={me} style={myStyle} points={props.points} saved={props.saved} onChange={props.setSaved} fill={props.fill} />
          ) : (
            <p className="lo-note">Pick a Style to grow its Ascendancy tree.</p>
          )}
        </>
      )}

      {step === 'oath' && champ && <OathPicker champ={me} champName={champ.name} saved={props.saved} onChange={props.setSaved} fill={props.fill} />}

      {step === 'deck' && champ && (
        <section className="box prep">
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
          <p className="lo-note prep-note">The default deck is ready to play. Edit it any time.</p>
        </section>
      )}

      {step === 'fight' && champ && (
        <>
          <section className="box prep">
            {(
              [
                ['champion', champ.name, STYLES[myStyle]?.name ?? myStyle],
                ['path', TREES[myStyle] ? 'Ascendancy' : 'Style', loadoutOf('Ascendancy') ?? STYLES[myStyle]?.name ?? ''],
                ['oath', 'Oath', loadoutOf('Oath') ?? ''],
                ['deck', `${props.deckSize(me)} cards`, props.deckCustom(me) ? 'your deck' : 'default'],
              ] as [Step, string, string][]
            ).map(([s, k, v]) => (
              <button key={s} type="button" className="prep-row" onClick={() => setStep(s)}>
                <span className="prep-k">{STEP_NAME[s]}</span>
                <span className="prep-v">
                  <b>{k}</b>
                  <span>{v}</span>
                </span>
                <span className="prep-go">Change</span>
              </button>
            ))}
          </section>

          <section className="box match">
            <h2>
              Opponent <span>{foe === 'online' ? 'a real player' : `${foeName} · ${foeChamp} · ${STYLES[foeStyle]?.name ?? foeStyle}`}</span>
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
                    {foeName}'s Path
                    <select value={foeStyle} onChange={(e) => props.setStyle('p2', e.target.value)}>
                      {props
                        .stylesOf(picks.p2)
                        .filter((s) => STYLES[`${s.champion_id}:${s.slot}`])
                        .map((s) => {
                          const key = `${s.champion_id}:${s.slot}`
                          return (
                            <option key={key} value={key}>
                              {s.name}
                            </option>
                          )
                        })}
                    </select>
                  </label>
                </>
              )}
            </div>
            {foe !== 'online' && <p className="lo-note">The {foeName} also gets a random Oath and a full Ascendancy tree.</p>}
            <TimerSetting />
          </section>
        </>
      )}

      <footer className="sel-foot">
        {at > 0 && (
          <button type="button" className="back" onClick={() => setStep(STEPS[at - 1])}>
            Back
          </button>
        )}
        {step === 'fight' ? (
          <>
            {foe !== 'online' && <Portrait champ={picks.p2} style={foeStyle} bust className="foe-art" />}
            <button type="button" className="start" onClick={props.onStart}>
              {foe === 'online' ? 'Find a match' : 'Fight!'}
            </button>
          </>
        ) : (
          <button type="button" className="start" disabled={!!blocker} onClick={() => next && setStep(next)}>
            {blocker || `Next: ${STEP_NAME[next]}`}
          </button>
        )}
      </footer>
    </div>
  )
}

// Pre-match steps, in order (Q 2026-10-25): Champion → Path (Style + its Ascendancy tree) → Oath → Deck → Fight.
// A Style and a full tree are required (no "no Style"), and so is an Oath; a step opens only when the ones before it are set.
// Loadout pieces: design/customization-options-2026-10-18.md. Picks are saved per Champion on every change.
import { useState } from 'react'
import { STYLES, TREES, type Side } from '../../engine'
import { t, useLang } from '../../i18n'
import { LangToggle } from '../../i18n/LangToggle'
import type { Champ, StyleRow } from '../Battle'
import { champColor, spriteClassOf } from '../fighters'
import { loadoutGaps, STEPS, type SavedLoadout, type Step } from '../loadout/loadout'
import { AscTree, OathPicker } from '../loadout/LoadoutParts'
import { RichList } from '../loadout/RichText'
import { tutorialDone } from '../settings'
import { TimerSetting } from '../timer/TurnTimer'
import { ComboLine } from '../tutorial/Tutorial'
import { ARCADE_STAGES } from '../arcade/arcade'
import type { Mode } from '../menu/TitleMenu'
import type { DeckStats } from '../../engine/deckStats'
import type { Preset, PresetView } from '../deck/presets'
import { StatBars } from '../deck/StatBars'
import { CHAMP_INFO, comboPattern, STYLE_SUMMARY } from './info'
import { Portrait } from './Portrait'
import './select.css'

export type FoeKind = 'ai' | 'tuktah' | 'online'

const STEP_EN: Record<Step, string> = { champion: 'Champion', path: 'Path', oath: 'Oath', deck: 'Deck', fight: 'Fight' }
const stepName = (s: Step) => t(STEP_EN[s])

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
  /** which menu entry led here: Arcade (random ladder), Versus (pick the opponent) or Multiplayer (online) */
  mode: Mode
  /** Versus: the opponent is rolled at random when the match starts */
  foeRandom: boolean
  setFoeRandom: (r: boolean) => void
  onMenu: () => void
  /** ready-made builds for the picked Champion (deck/presets) */
  presets: PresetView[]
  /** the preset the player's picks match now */
  activePreset?: string
  onPreset: (p: Preset) => void
  /** overview of the player's current build (null until a Style is picked) */
  myStats: DeckStats | null
}) {
  useLang()
  const { champions, picks, foe, step, setStep, mode } = props
  const modeName = mode === 'arcade' ? t('Arcade') : mode === 'multi' ? t('Multiplayer') : t('Versus')
  const me = picks.p1
  const info = CHAMP_INFO[me]
  const champ = champions.find((c) => c.id === me)
  const myStyle = props.styleKey('p1')
  const [full, setFull] = useState<string | null>(null)
  const newPlayer = !tutorialDone()
  const foeName = foe === 'tuktah' ? t('Tuktah') : t('AI')
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
    step === 'path' ? (gaps.style ? t('Pick a Style') : gaps.asc > 0 ? t(gaps.asc > 1 ? 'Spend {n} more Ascendancy points' : 'Spend {n} more Ascendancy point', { n: gaps.asc }) : '')
    : step === 'oath' && gaps.oath ? t('Pick an Oath')
    : ''

  return (
    <div className="select" style={{ '--tint': champColor(me) } as React.CSSProperties}>
      <header className="sel-head">
        <button type="button" className="menu-btn" onClick={props.onMenu} aria-label={t('Menu')}>
          ◀ <b>{modeName}</b>
        </button>
        <span className="sel-head-tools">
          <LangToggle />
          <button type="button" className={`tut-btn${newPlayer ? ' new' : ''}`} onClick={props.onTutorial}>
            {newPlayer ? t('New here? Play the tutorial') : t('Tutorial')}
          </button>
        </span>
      </header>

      <nav className="steps" aria-label={t('Steps before the fight')}>
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
            {stepName(s)}
          </button>
        ))}
      </nav>

      {step === 'champion' && (
        <>
          {champ && (
            <section className="hero">
              <Portrait champ={me} style={myStyle} className="hero-art" />
              <div className="hero-info">
                <small>{t('Choose your Champion')}</small>
                <h1>{champ.name}</h1>
                {info && <p className="hero-role">{t(info.role)}</p>}
                <ul className="chips">
                  <li>
                    <i>HP</i>
                    {champ.hp_start}
                    {champ.hp_max !== champ.hp_start ? ` / ${champ.hp_max}` : ''}
                  </li>
                  {info && <li>{props.fill(t(info.resource), me)}</li>}
                </ul>
              </div>
            </section>
          )}

          <div className="roster" role="radiogroup" aria-label={t('Your Champion')}>
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

          {champ && props.presets.length > 0 && (
            <section className="box presets">
              <h2>
                {t('Presets')} <span>{t('a full build in one tap · change anything later')}</span>
              </h2>
              <div className="preset-opts">
                {props.presets.map(({ preset: p, stats, problems }) => {
                  const on = props.activePreset === p.id
                  return (
                    <div key={p.id} className={`preset${on ? ' on' : ''}`}>
                      <div className="preset-head">
                        <b>{p.name}</b>
                        <span>{STYLES[p.style]?.name ?? p.style}</span>
                      </div>
                      <p className="preset-pitch">{t(p.pitch)}</p>
                      <StatBars stats={stats} compact />
                      <button type="button" className="preset-use" disabled={problems.length > 0 || on} title={problems.join(' · ') || undefined} onClick={() => props.onPreset(p)}>
                        {problems.length ? t('Out of date') : on ? t('In use') : t('Use this build')}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {champ && info && (
            <details className="box how">
              <summary>
                {t('How {name} plays', { name: champ.name })}
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
                  <li key={l}>{t(l)}</li>
                ))}
              </ul>
              <h3>{t('Signature combo')}</h3>
              <ComboLine pattern={comboPattern(me)} text={props.fill(t(info.combo), me)} />
            </details>
          )}
        </>
      )}

      {step === 'path' && champ && (
        <>
          <section className="box styles">
            <h2>
              {t('Path')} <span>{t('pick 1 Style · your passive')}</span>
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
                        <span>{works ? <RichList text={summary ? props.fill(t(summary), key) : props.styleText[key]} /> : t('Not playable yet')}</span>
                      </span>
                    </button>
                    {works && summary && (
                      <button type="button" className="more" aria-expanded={full === key} onClick={() => setFull(full === key ? null : key)}>
                        {full === key ? t('Hide full rules') : t('Full rules')}
                      </button>
                    )}
                    {full === key && <div className="full"><RichList text={props.styleText[key] ?? ''} /></div>}
                  </div>
                )
              })}
            </div>
          </section>
          {myStyle ? (
            <AscTree champ={me} style={myStyle} points={props.points} saved={props.saved} onChange={props.setSaved} fill={props.fill} />
          ) : (
            <p className="lo-note">{t('Pick a Style to grow its Ascendancy tree.')}</p>
          )}
        </>
      )}

      {step === 'oath' && champ && <OathPicker champ={me} champName={champ.name} saved={props.saved} onChange={props.setSaved} fill={props.fill} />}

      {step === 'deck' && champ && (
        <section className="box prep">
          <button type="button" className="prep-row" onClick={props.onEditDeck}>
            <span className="prep-k">{t('Deck')}</span>
            <span className="prep-v">
              <b>{t('{n} cards', { n: props.deckSize(me) })}</b>
              <span>
                {props.deckCustom(me) ? t('your deck') : props.deckSaved(me) ? t('default (your deck needs fixing)') : t('default')}
                {props.missing(me) ? ` · ⚠ ${t('{n} effects not coded yet', { n: props.missing(me) })}` : ''}
              </span>
            </span>
            <span className="prep-go">{t('Edit')}</span>
          </button>
          <p className="lo-note prep-note">{t('The default deck is ready to play. Edit it any time.')}</p>
        </section>
      )}

      {step === 'fight' && champ && (
        <>
          <section className="box prep">
            {(
              [
                ['champion', champ.name, STYLES[myStyle]?.name ?? myStyle],
                ['path', TREES[myStyle] ? t('Ascendancy') : t('Style'), loadoutOf('Ascendancy') ?? STYLES[myStyle]?.name ?? ''],
                ['oath', t('Oath'), loadoutOf('Oath') ?? ''],
                ['deck', t('{n} cards', { n: props.deckSize(me) }), props.deckCustom(me) ? t('your deck') : t('default')],
              ] as [Step, string, string][]
            ).map(([s, k, v]) => (
              <button key={s} type="button" className="prep-row" onClick={() => setStep(s)}>
                <span className="prep-k">{stepName(s)}</span>
                <span className="prep-v">
                  <b>{k}</b>
                  <span>{v}</span>
                </span>
                <span className="prep-go">{t('Change')}</span>
              </button>
            ))}
          </section>

          {props.myStats && (
            <section className="box build-stats">
              <h2>
                {t('Build overview')} <span>{props.presets.find((v) => v.preset.id === props.activePreset)?.preset.name ?? t('from your cards, Path and Oath')}</span>
              </h2>
              <StatBars stats={props.myStats} />
            </section>
          )}

          {mode === 'arcade' ? (
            <section className="box match">
              <h2>
                {t('Arcade')} <span>{t('{n} stages · random opponents · final boss', { n: ARCADE_STAGES + 1 })}</span>
              </h2>
              <p className="lo-note">{t('Each stage the AI gets tougher, from Rookie to Legend. Lose and you can Continue from the same stage, with a reworked Ascendancy and Oath if you like.')}</p>
              <TimerSetting />
            </section>
          ) : mode === 'multi' ? (
            <section className="box match">
              <h2>
                {t('Opponent')} <span>{t('a real player')}</span>
              </h2>
              <TimerSetting />
            </section>
          ) : (
          <section className="box match">
            <h2>
              {t('Opponent')} <span>{`${foeName} · ${props.foeRandom ? t('Random') : `${foeChamp} · ${STYLES[foeStyle]?.name ?? foeStyle}`}`}</span>
            </h2>
            <div className="vs-row">
              <label>
                {t('Play against')}
                <select value={foe} onChange={(e) => props.setFoe(e.target.value as FoeKind)}>
                  <option value="ai">{t('AI')}</option>
                  <option value="tuktah" disabled={!props.canTuktah}>
                    {t('Tuktah (Claude)')}{props.canTuktah ? '' : ` · ${t('open on claude.ai')}`}
                  </option>
                </select>
              </label>
              <label>
                {t("{who}'s Champion", { who: foeName })}
                <select
                  value={props.foeRandom ? '?' : picks.p2}
                  onChange={(e) => {
                    props.setFoeRandom(e.target.value === '?')
                    if (e.target.value !== '?') props.setChamp('p2', e.target.value)
                  }}
                >
                  <option value="?">{t('Random')}</option>
                  {champions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {!props.foeRandom && (
                <label>
                  {t("{who}'s Path", { who: foeName })}
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
              )}
            </div>
            <p className="lo-note">{t('The {who} also gets a random Oath and a full Ascendancy tree.', { who: foeName })}</p>
            <TimerSetting />
          </section>
          )}
        </>
      )}

      <footer className="sel-foot">
        {at > 0 && (
          <button type="button" className="back" onClick={() => setStep(STEPS[at - 1])}>
            {t('Back')}
          </button>
        )}
        {step === 'fight' ? (
          <>
            {mode === 'versus' &&
              (props.foeRandom ? (
                <span className="foe-art foe-random" aria-hidden="true">?</span>
              ) : (
                <Portrait champ={picks.p2} style={foeStyle} bust className="foe-art" />
              ))}
            <button type="button" className="start" onClick={props.onStart}>
              {mode === 'multi' ? t('Find a match') : mode === 'arcade' ? t('Start Arcade') : t('Fight!')}
            </button>
          </>
        ) : (
          <button type="button" className="start" disabled={!!blocker} onClick={() => next && setStep(next)}>
            {blocker || t('Next: {step}', { step: stepName(next) })}
          </button>
        )}
      </footer>
    </div>
  )
}

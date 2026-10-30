// Arcade Continue screen (Q 2026-10-29): after a loss the player may rework the run's build before the retry.
// The Champion and Style stay fixed for the run; the Ascendancy tree and the Oath can change (saved like the pre-match steps).
import { useState } from 'react'
import { t, useLang } from '../../i18n'
import { champColor } from '../fighters'
import { firstOpenStep, type SavedLoadout } from '../loadout/loadout'
import { AscTree, OathPicker } from '../loadout/LoadoutParts'
import { Portrait } from '../select/Portrait'
import '../select/select.css'
import { isBoss, tierOf, type ArcadeRun } from './arcade'

export function ArcadeContinue(props: {
  run: ArcadeRun
  champName: string
  styleName: string
  /** the next stage's opponent, as "Champion · Style" */
  foeName: string
  saved: SavedLoadout
  setSaved: (l: SavedLoadout) => void
  /** game_config asc_points (a tree may add its own bonus) */
  points: number
  fill: (text: string, group: string) => string
  onFight: () => void
  onGiveUp: () => void
}) {
  useLang()
  const { run, saved } = props
  const foe = run.stages[run.at]
  const [ascDirty, setAscDirty] = useState(false)
  const ready = !ascDirty && firstOpenStep(run.champ, run.style, props.points, saved) === 'fight'

  return (
    <div className="select" style={{ '--tint': champColor(run.champ) } as React.CSSProperties}>
      <header className="sel-head">
        <div>
          <small>
            {t('Continue?')} · {props.champName} · {props.styleName}
          </small>
          <h1>{t('Stage {n}/{total} · {tier}', { n: run.at + 1, total: run.stages.length, tier: t(tierOf(run.at, run).name) })}</h1>
        </div>
        {foe && !isBoss(foe) && <Portrait champ={foe.champ} style={foe.style} bust className="foe-art" />}
      </header>
      <p className="lo-note">
        {t('Rework your Ascendancy and Oath, then retry against {foe}.', { foe: props.foeName })}
      </p>

      <AscTree champ={run.champ} style={run.style} points={props.points} saved={saved} onChange={props.setSaved} fill={props.fill} onDirty={setAscDirty} />
      <OathPicker champ={run.champ} champName={props.champName} saved={saved} onChange={props.setSaved} fill={props.fill} />

      <footer className="sel-foot">
        <button type="button" className="back" onClick={props.onGiveUp}>
          {t('Give up')}
        </button>
        <button type="button" className="start" disabled={!ready} onClick={props.onFight}>
          {ready ? t('Fight!') : ascDirty ? t('Save your Ascendancy first') : t('Spend every point and pick an Oath')}
        </button>
      </footer>
    </div>
  )
}

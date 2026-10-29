// Arcade ladder between fights: the stages top to bottom (fighting-game tower), beaten ones ticked, the next one lit.
// After the last stage it turns into the ARCADE CLEAR screen.
import { t, useLang } from '../../i18n'
import { champColor, spriteClassOf } from '../fighters'
import { Portrait } from '../select/Portrait'
import { BOSS, cleared, isBoss, tierOf, type ArcadeRun } from './arcade'

/** The boss's ladder face: every Champion's art in turn, violet (arcade.ts BOSS). */
const BOSS_FACES: [string, string][] = [['TK', 'TK:1'], ['BR', 'BR:1'], ['AS', 'AS:1'], ['MG', 'MG:1'], ['MG', 'MG:2']]
export function BossPortrait({ className = '' }: { className?: string }) {
  return (
    <span className={`portrait bust boss ${className}`} aria-hidden="true">
      {BOSS_FACES.map(([c, s], k) => (
        <span key={s} className={`face ${spriteClassOf(c, s) ?? ''}`} style={{ '--k': k, '--n': BOSS_FACES.length } as React.CSSProperties} />
      ))}
    </span>
  )
}
import '../menu/menu.css'

export function ArcadeLadder(props: {
  run: ArcadeRun
  champName: (id: string) => string
  styleName: (key: string) => string
  onFight: () => void
  /** clear this run and pick a Champion for a new one */
  onNewRun: () => void
  onMenu: () => void
}) {
  useLang()
  const { run } = props
  const done = cleared(run)
  const next = run.stages[run.at]

  return (
    <div className="ladder" style={{ '--tint': champColor(run.champ) } as React.CSSProperties}>
      <div className="ld-head">
        <Portrait champ={run.champ} style={run.style} bust className="ld-me" />
        <div>
          <small>{t('Arcade')}</small>
          <h1>{done ? t('ARCADE CLEAR!') : t('Stage {n}/{total}', { n: run.at + 1, total: run.stages.length })}</h1>
          <p>
            {props.champName(run.champ)} · {props.styleName(run.style)}
            {run.continues ? ` · ${t('Continues used: {n}', { n: run.continues })}` : ''}
          </p>
        </div>
      </div>

      <ol className="ld-stages">
        {run.stages
          .map((f, i) => ({ f, i }))
          .reverse()
          .map(({ f, i }) =>
            isBoss(f) ? (
              <li key={i} className={`ld-boss${i < run.at ? ' won' : i === run.at ? ' next' : ''}`} aria-current={i === run.at ? 'step' : undefined}>
                <i>{i < run.at ? '✓' : '☠'}</i>
                <BossPortrait className="ld-foe" />
                <span>
                  <b>{i > run.at ? t('Final boss') : t(BOSS.name)}</b>
                  <small>{t('Every Champion in one')} · {t(tierOf(i, run).name)}</small>
                </span>
              </li>
            ) : (
              <li
                key={i}
                className={i < run.at ? 'won' : i === run.at ? 'next' : ''}
                style={{ '--c': champColor(f.champ) } as React.CSSProperties}
                aria-current={i === run.at ? 'step' : undefined}
              >
                <i>{i < run.at ? '✓' : i + 1}</i>
                <Portrait champ={f.champ} style={f.style} bust className="ld-foe" />
                <span>
                  <b>{i > run.at ? '???' : props.champName(f.champ)}</b>
                  <small>
                    {i > run.at ? '' : `${props.styleName(f.style)} · `}
                    {t(tierOf(i).name)}
                  </small>
                </span>
              </li>
            ),
          )}
      </ol>

      <footer className="ld-foot">
        <button type="button" className="tm-small alt" onClick={props.onMenu}>
          {t('Menu')}
        </button>
        <button type="button" className="tm-small alt" onClick={props.onNewRun}>
          {t('New run')}
        </button>
        {!done && next && (
          <button type="button" className="tm-small go" autoFocus onClick={props.onFight}>
            {t('Fight!')}
          </button>
        )}
      </footer>
    </div>
  )
}

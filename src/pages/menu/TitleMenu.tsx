// Title / main menu, like a fighting game's (Q 2026-10-28): Arcade, Versus, Multiplayer, Settings.
// Arrow keys move between items too. Multiplayer is the Online 1v1 match, which only works where the page has a
// shared database (claude.ai); elsewhere it shows Coming soon.
import { useState } from 'react'
import { t, useLang } from '../../i18n'
import { LangToggle } from '../../i18n/LangToggle'
import type { Champ } from '../Battle'
import { champColor } from '../fighters'
import { Portrait } from '../select/Portrait'
import { tutorialDone } from '../settings'
import { TimerSetting } from '../timer/TurnTimer'
import { ARCADE_STAGES, cleared, type ArcadeRun } from '../arcade/arcade'
import './menu.css'

export type Mode = 'arcade' | 'versus' | 'multi'

export function TitleMenu(props: {
  champions: Champ[]
  run: ArcadeRun | null
  canOnline: boolean
  onPick: (m: Mode) => void
  onTutorial: () => void
}) {
  useLang()
  const [settings, setSettings] = useState(false)
  const run = props.run && !cleared(props.run) ? props.run : null
  const items: { id: Mode | 'settings'; label: string; sub: string; off?: boolean }[] = [
    {
      id: 'arcade',
      label: t('Arcade'),
      sub: run ? t('Resume · Stage {n}/{total}', { n: run.at + 1, total: ARCADE_STAGES }) : t('Fight {n} stages in a row', { n: ARCADE_STAGES }),
    },
    { id: 'versus', label: t('Versus'), sub: t('Pick your opponent, or leave it random') },
    { id: 'multi', label: t('Multiplayer'), sub: props.canOnline ? t('Online 1v1 vs a real player') : t('Coming soon'), off: !props.canOnline },
    { id: 'settings', label: t('Settings'), sub: t('Language, turn timer, tutorial') },
  ]

  // up / down arrows walk the menu like a pad would
  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.tm-item:not(:disabled)')]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const next = btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length]
    next?.focus()
    e.preventDefault()
  }

  return (
    <div className="title-menu">
      <div className="tm-lineup" aria-hidden="true">
        {props.champions.map((c, i) => (
          <span key={c.id} className="tm-fighter" style={{ '--c': champColor(c.id), '--i': i } as React.CSSProperties}>
            <Portrait champ={c.id} />
          </span>
        ))}
      </div>

      <div className="tm-side">
        <h1 className="tm-logo">
          <span>Champion</span>
          <span>Card Clash</span>
        </h1>

        {settings ? (
          <section className="tm-settings" aria-label={t('Settings')}>
            <h2>{t('Settings')}</h2>
            <LangToggle />
            <TimerSetting />
            <button type="button" className={`tm-small${tutorialDone() ? '' : ' new'}`} onClick={props.onTutorial}>
              {tutorialDone() ? t('Tutorial') : t('New here? Play the tutorial')}
            </button>
            <button type="button" className="tm-small alt" autoFocus onClick={() => setSettings(false)}>
              {t('Back')}
            </button>
          </section>
        ) : (
          <nav className="tm-list" aria-label={t('Main menu')} onKeyDown={onKey}>
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className="tm-item"
                disabled={it.off}
                autoFocus={i === 0}
                onClick={() => (it.id === 'settings' ? setSettings(true) : props.onPick(it.id))}
              >
                <b>{it.label}</b>
                <span>{it.sub}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}

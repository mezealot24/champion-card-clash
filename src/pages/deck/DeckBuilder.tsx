// Player deck builder: pick cards from your Champion's pool, exactly the deck size, max copies each (rules in deck.ts).
import { useState } from 'react'
import type { CardType } from '../../engine'
import { t, useLang } from '../../i18n'
import { champColor } from '../fighters'
import { Portrait } from '../select/Portrait'
import { countOf, deckPool, deckProblems, defaultList, loadDeck, pickTarget, saveDeck, styleCards, type DeckList, type DeckRow, type DeckRules } from './deck'
import './deck.css'

const TYPES: CardType[] = ['P', 'K', 'S']
const TYPE_NAME: Record<CardType, string> = { P: 'Punch', K: 'Kick', S: 'Skill' }

export function DeckBuilder(props: {
  champ: string
  champName: string
  /** all of this Champion's cards */
  rows: DeckRow[]
  style?: string
  styleName?: string
  rules: DeckRules
  onClose: () => void
}) {
  useLang()
  const { champ, rows, style, rules } = props
  const [list, setList] = useState<DeckList>(() => loadDeck(champ) ?? defaultList(rows))
  const [type, setType] = useState<CardType | ''>('')
  const [onlyPicked, setOnlyPicked] = useState(false)
  // card whose full effect text is shown (long texts are cut to two lines)
  const [open, setOpen] = useState<string | null>(null)
  const pool = deckPool(rows)
  const target = pickTarget(rows, style, rules)
  const n = countOf(list)
  const problems = deckProblems(list, rows, style, rules)
  const fixed = styleCards(rows, style)
  const shown = pool.filter((r) => (!type || r.type === type) && (!onlyPicked || (list[r.id] ?? 0) > 0))
  const byType = TYPES.map((ty) => `${ty} ${pool.filter((r) => r.type === ty).reduce((s, r) => s + (list[r.id] ?? 0), 0)}`).join(' · ')

  const set = (id: string, copies: number) => setList({ ...list, [id]: Math.max(0, Math.min(rules.maxCopies, copies)) })

  return (
    <div className="select deckb" style={{ '--tint': champColor(champ) } as React.CSSProperties}>
      <header className="deckb-head">
        <Portrait champ={champ} style={style} bust className="head-art" />
        <h1>
          <small>{t('Deck builder')}</small>
          {props.champName}
          {props.styleName && <span className="head-style">{props.styleName}</span>}
        </h1>
        <div className={`deckb-count${n === target ? ' ok' : ''}`} aria-live="polite">
          <b>
            {n} / {target}
          </b>
          <span>{byType}</span>
        </div>
      </header>

      <p className="deckb-rules">
        {t('Pick exactly {n} cards, up to {max} copies of each.', { n: target, max: rules.maxCopies })}
        {fixed.length > 0 && ` ${t('Your Style{name} adds {n} more, for {size} in all.', { name: props.styleName ? ` (${props.styleName})` : '', n: fixed.length, size: rules.size })}`}
      </p>

      <div className="deckb-tools">
        <div className="deckb-types" role="radiogroup" aria-label={t('Card type')}>
          {(['', ...TYPES] as const).map((ty) => (
            <button key={ty || 'all'} type="button" role="radio" aria-checked={type === ty} onClick={() => setType(ty)}>
              {ty ? t(TYPE_NAME[ty]) : t('All')}
            </button>
          ))}
        </div>
        <label className="inline deckb-only">
          <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} /> {t('In deck only')}
        </label>
      </div>

      <ul className="deckb-list">
        {shown.map((r) => {
          const c = list[r.id] ?? 0
          return (
            <li key={r.id} className={c ? 'in' : ''}>
              <span className={`deckb-type t-${r.type}`}>{r.type}</span>
              <button type="button" className={`deckb-card${open === r.id ? ' open' : ''}`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <b>
                  {r.name ?? r.id}
                  <span className="deckb-stats">
                    <i>{r.dmg} dmg</i>
                    {r.cost != null && <i>{t('cost {n}', { n: r.cost })}</i>}
                  </span>
                </b>
                {r.effect && <span className="deckb-text">{r.effect}</span>}
              </button>
              <div className="deckb-step">
                <button type="button" aria-label={t('Remove {card}', { card: r.name ?? r.id })} disabled={c === 0} onClick={() => set(r.id, c - 1)}>
                  −
                </button>
                <output>{c}</output>
                <button type="button" aria-label={t('Add {card}', { card: r.name ?? r.id })} disabled={c >= rules.maxCopies} onClick={() => set(r.id, c + 1)}>
                  +
                </button>
              </div>
            </li>
          )
        })}
        {shown.length === 0 && <li className="deckb-empty">{t('No cards here.')}</li>}
      </ul>

      {fixed.length > 0 && (
        <details className="box deckb-fixed">
          <summary>{t('Style cards, always in ({n})', { n: fixed.length })}</summary>
          <ul>
            {fixed.map((r) => (
              <li key={r.id}>
                <span className={`deckb-type t-${r.type}`}>{r.type}</span> {r.name ?? r.id}
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="deckb-foot">
        {problems.length > 0 && <p className="deckb-warn">{problems.join(' · ')}</p>}
        <div>
          <button type="button" className="deckb-ghost" onClick={() => setList(defaultList(rows))}>
            {t('Reset to default')}
          </button>
          <button type="button" className="deckb-ghost" onClick={props.onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="start"
            disabled={problems.length > 0}
            onClick={() => {
              saveDeck(champ, list, rows)
              props.onClose()
            }}
          >
            {t('Save deck')}
          </button>
        </div>
      </footer>
    </div>
  )
}

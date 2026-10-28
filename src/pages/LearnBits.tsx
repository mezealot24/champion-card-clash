// Battle-screen pieces that help players remember combos and read cards (playtest feedback #3, pack B).
// Kept out of Arena.tsx on purpose; text comes from learnText.ts.
import { useState } from 'react'
import type { CardInst, GameState, Side } from '../engine'
import { tuningOf } from '../engine/tuning'
import type { EffectSpec } from '../engine/effects/spec'
import { t, useLang } from '../i18n'
import { comboInfo, comboSteps, compactRules } from './learnText'
import './learnbits.css'

/**
 * Signature combo next to the Field: the pattern as P / K / S pips that light up as the Field holds the cards
 * (any order). Tap it for what the combo needs and gives.
 */
export function ComboTracker({ game, side, cards }: { game: GameState; side: Side; cards: CardInst[] }) {
  useLang()
  const [open, setOpen] = useState(false)
  const p = game.players[side]
  const combos = comboInfo(p.championId, p.style, tuningOf(game, side))
  if (!combos.length) return null
  const types = cards.map((c) => c.def.type)
  return (
    <div className={`combo-track ${side === 'p1' ? 'me' : 'enemy'}`}>
      {combos.map((c) => {
        const lit = comboSteps(c.pattern, types)
        const ready = lit.every(Boolean)
        return (
          <button
            key={c.name}
            type="button"
            className={`ct-row${ready ? ' ready' : ''}`}
            aria-label={`${t(side === 'p1' ? 'Your combo' : 'Foe combo')} ${c.name}: ${c.pattern.join(' ')}, ${t('{n} of 3 on Field.', { n: lit.filter(Boolean).length })} ${c.need}. ${c.reward}`}
            onClick={(e) => (e.stopPropagation(), setOpen(!open))}
          >
            <span className="ct-pips">
              {c.pattern.map((t, i) => (
                <i key={i} className={`ct-pip t-${t}${lit[i] ? ' on' : ''}`}>
                  {t}
                </i>
              ))}
            </span>
            <span className="ct-name">{ready ? t('READY') : c.name}</span>
          </button>
        )
      })}
      {open && (
        <div className="ct-pop" onClick={(e) => (e.stopPropagation(), setOpen(false))}>
          {combos.map((c) => (
            <p key={c.name}>
              <b>{c.name}</b> · {t('{pattern} in one Strike, any order', { pattern: c.pattern.join(' ') })}
              <br />
              {t('Needs:')} {c.need}
              <br />
              {t('Gives:')} {c.reward}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Card face effect, as Q reads a card: timing, one line per condition, then what you gain (green) / pay (red). Full text is in the card sheet. */
export function CompactFx({ spec, res }: { spec: EffectSpec; res?: string }) {
  return (
    <>
      {compactRules(spec, res).map((r, i) => (
        <span className="rule crule" key={i}>
          <span className="tim">{r.tag}</span>
          {r.when.map((w, j) => (
            <span className="when" key={j}>
              {w}
            </span>
          ))}
          {r.gain.length > 0 && <span className="gain">{r.gain.join(', ')}</span>}
          {r.cost.length > 0 && <span className="cost-l">{r.cost.join(', ')}</span>}
        </span>
      ))}
    </>
  )
}

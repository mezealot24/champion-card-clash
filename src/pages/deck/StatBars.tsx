// Build overview: five 0-10 bars (HP, Defend, ATK, Technique, Speed). Numbers from engine/deckStats.ts or a preset.
import { STAT_KEYS, STAT_MAX, type DeckStats, type StatKey } from '../../engine/deckStats'
import { t, useLang } from '../../i18n'

const NAME: Record<StatKey, string> = { hp: 'HP', def: 'Defend', atk: 'ATK', tech: 'Technique', spd: 'Speed' }

export function StatBars({ stats, compact }: { stats: DeckStats; compact?: boolean }) {
  useLang()
  return (
    <dl className={`statbars${compact ? ' compact' : ''}`}>
      {STAT_KEYS.map((k) => (
        <div key={k} className={`statbar s-${k}`}>
          <dt>{t(NAME[k])}</dt>
          <dd>
            <span className="statbar-track" role="meter" aria-valuemin={0} aria-valuemax={STAT_MAX} aria-valuenow={stats[k]} aria-label={t(NAME[k])}>
              <span style={{ width: `${(stats[k] / STAT_MAX) * 100}%` }} />
            </span>
            <b>{stats[k]}</b>
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Champion step presets (Q 2026-10-30): one tab per ready-made build (named with its Path) over a single set of stat bars.
// A tab lights up at once; the bars follow a beat later, so tapping through tabs fast doesn't make them thrash.
import { useEffect, useState } from 'react'
import { STYLES } from '../../engine'
import { t, useLang } from '../../i18n'
import type { Preset, PresetView } from '../deck/presets'
import { StatBars } from '../deck/StatBars'

const SETTLE_MS = 220

export function PresetPicker({ presets, active, onUse }: { presets: PresetView[]; active?: string; onUse: (p: Preset) => void }) {
  useLang()
  const first = presets.find((v) => v.preset.id === active)?.preset.id ?? presets[0].preset.id
  const [tab, setTab] = useState(first)
  const [shown, setShown] = useState(first)
  useEffect(() => {
    if (tab === shown) return
    const id = setTimeout(() => setShown(tab), SETTLE_MS)
    return () => clearTimeout(id)
  }, [tab, shown])

  const view = presets.find((v) => v.preset.id === shown) ?? presets[0]
  const { preset: p, stats, problems } = view
  const on = active === p.id
  const settling = tab !== shown

  return (
    <section className="box presets">
      <h2>
        {t('Presets')} <span>{t('a full build in one tap · change anything later')}</span>
      </h2>
      <div className="preset-tabs" role="tablist" aria-label={t('Presets')}>
        {presets.map(({ preset: x }) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={`${tab === x.id ? 'on' : ''}${active === x.id ? ' used' : ''}`}
            onClick={() => setTab(x.id)}
          >
            <small>{STYLES[x.style]?.name ?? x.style}</small>
            <b>{x.name}</b>
            {active === x.id && <i aria-label={t('In use')}>✓</i>}
          </button>
        ))}
      </div>
      <div className={`preset-body${settling ? ' settling' : ''}`} role="tabpanel" aria-busy={settling}>
        <p className="preset-pitch">{t(p.pitch)}</p>
        <StatBars stats={stats} compact />
        <button type="button" className="preset-use" disabled={settling || problems.length > 0 || on} title={problems.join(' · ') || undefined} onClick={() => onUse(p)}>
          {problems.length ? t('Out of date') : on ? t('In use') : t('Use this build')}
        </button>
      </div>
    </section>
  )
}

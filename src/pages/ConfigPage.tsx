import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import type { GameConfigRow, Json } from '../lib/database.types'
import { SaveButton } from '../components/SaveButton'
import { bossConfigKey, cleanParams, RULE_KEYS, TUNING_FIELDS, tuningErrors, type TuningParams } from '../engine'
import { TuningFields } from '../components/TuningFields'

/** game_config keys of the Arcade boss numbers (edited in the Final boss panel, not the table) */
const BOSS_KEYS = new Map(TUNING_FIELDS.BOSS.map((f) => [bossConfigKey(f.key), f.key]))

type Draft = Omit<GameConfigRow, 'value' | 'updated_at'> & { raw: string }

function parse(raw: string): { value?: Json; error?: string } {
  try {
    return { value: JSON.parse(raw) as Json }
  } catch {
    return { error: 'Must be JSON, e.g. 5, 2.5, true, "text", [1,2]' }
  }
}

export function ConfigPage() {
  const { data, error, reload } = useAsync(
    async () => must(await supabase.from('game_config').select('*').order('key')),
    [],
  )
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  return (
    <>
      <BossPanel key={`boss-${JSON.stringify(data)}`} rows={data} onSaved={reload} />
      <ConfigTable key={JSON.stringify(data)} rows={data.filter((r) => !BOSS_KEYS.has(r.key))} onSaved={reload} />
    </>
  )
}

/** Arcade final boss numbers (tuning group BOSS, engine/tuning.ts), stored as game_config boss_* rows; only values off the default are kept. */
function BossPanel({ rows, onSaved }: { rows: GameConfigRow[]; onSaved: () => void }) {
  const [params, setParams] = useState<TuningParams>(() =>
    Object.fromEntries(rows.flatMap((r) => (BOSS_KEYS.has(r.key) && typeof r.value === 'number' ? [[BOSS_KEYS.get(r.key)!, r.value]] : []))),
  )
  const errors = tuningErrors('BOSS', params)

  async function save() {
    const keep = cleanParams('BOSS', params)
    const fields = TUNING_FIELDS.BOSS
    const upserts = fields.filter((f) => keep[f.key] !== undefined).map((f) => ({ key: bossConfigKey(f.key), value: keep[f.key] as Json, description: `Arcade boss: ${f.label}` }))
    // a field back at its default: drop the row so the code default rules again
    const drop = fields.filter((f) => keep[f.key] === undefined).map((f) => bossConfigKey(f.key)).filter((k) => rows.some((r) => r.key === k))
    if (upserts.length) must(await supabase.from('game_config').upsert(upserts))
    if (drop.length) must(await supabase.from('game_config').delete().in('key', drop))
    onSaved()
  }

  return (
    <div className="panel">
      <h2>Final boss (Arcade)</h2>
      <p className="muted">Chimera's stats for the next Arcade boss fight. Blank = code default.</p>
      <TuningFields group="BOSS" params={params} onChange={setParams} />
      {errors.length > 0 && <p className="error">{errors.join(' · ')}</p>}
      <div className="actions">
        <SaveButton onSave={save} disabled={errors.length > 0} />
      </div>
    </div>
  )
}

function ConfigTable({ rows, onSaved }: { rows: GameConfigRow[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(
    rows.map(({ key, value, description }) => ({ key, description, raw: JSON.stringify(value) })),
  )
  const [newKey, setNewKey] = useState('')

  const edit = (key: string, patch: Partial<Draft>) => setDrafts(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const invalid = drafts.some((d) => parse(d.raw).error)
  const keyValid = /^[a-z][a-z0-9_]*$/.test(newKey) && !drafts.some((d) => d.key === newKey)

  async function save() {
    must(await supabase.from('game_config').upsert(
      drafts.map((d) => ({ key: d.key, description: d.description, value: parse(d.raw).value as Json })),
    ))
    onSaved()
  }

  async function remove(key: string) {
    if (!confirm(`Delete config "${key}"?`)) return
    must(await supabase.from('game_config').delete().eq('key', key))
    onSaved()
  }

  return (
    <div className="panel">
      <h2>Game configuration</h2>
      <p className="muted">Shared game rules. Values are JSON (type plain numbers as they are).</p>
      <table className="cards-mobile config-table">
        <thead><tr><th>Key</th><th>Value</th><th>Description</th><th /></tr></thead>
        <tbody>
          {drafts.map((d) => {
            const err = parse(d.raw).error
            return (
              <tr key={d.key}>
                <td className="c-key"><code>{d.key}</code>{d.key in RULE_KEYS && <span className="ok" title="The battle engine reads this rule"> · engine</span>}</td>
                <td className="c-value" data-label="Value">
                  <input className={err ? 'invalid' : 'short'} aria-label={`${d.key} value`} value={d.raw} title={err} onChange={(e) => edit(d.key, { raw: e.target.value })} />
                  {err && <small className="error">{err}</small>}
                </td>
                <td className="c-desc" data-label="Description"><input aria-label={`${d.key} description`} value={d.description} onChange={(e) => edit(d.key, { description: e.target.value })} /></td>
                <td className="c-del"><button className="danger" onClick={() => remove(d.key)} title="Delete" aria-label={`Delete ${d.key}`}>✕</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="actions sticky-bar">
        <input aria-label="New key" placeholder="new_key" value={newKey} onChange={(e) => setNewKey(e.target.value.trim())} />
        <button
          className="secondary"
          disabled={!keyValid}
          onClick={() => {
            setDrafts([...drafts, { key: newKey, raw: '0', description: '' }])
            setNewKey('')
          }}
        >
          + Add key
        </button>
        <SaveButton onSave={save} disabled={invalid} />
      </div>
    </div>
  )
}

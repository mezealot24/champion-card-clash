import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import type { GameConfigRow, Json } from '../lib/database.types'
import { SaveButton } from '../components/SaveButton'

type Draft = Omit<GameConfigRow, 'value' | 'updated_at'> & { raw: string }

function parse(raw: string): { value?: Json; error?: string } {
  try {
    return { value: JSON.parse(raw) as Json }
  } catch {
    return { error: 'ต้องเป็น JSON เช่น 5, 2.5, true, "text", [1,2]' }
  }
}

export function ConfigPage() {
  const { data, error, reload } = useAsync(
    async () => must(await supabase.from('game_config').select('*').order('key')),
    [],
  )
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  return <ConfigTable key={JSON.stringify(data)} rows={data} onSaved={reload} />
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
    if (!confirm(`ลบ config "${key}"?`)) return
    must(await supabase.from('game_config').delete().eq('key', key))
    onSaved()
  }

  return (
    <div className="panel">
      <h2>Game configuration</h2>
      <p className="muted">ค่ากติกากลางของเกม ค่าเป็น JSON (ตัวเลขพิมพ์ตรงๆ ได้เลย)</p>
      <table>
        <thead><tr><th>Key</th><th>Value</th><th>Description</th><th /></tr></thead>
        <tbody>
          {drafts.map((d) => {
            const err = parse(d.raw).error
            return (
              <tr key={d.key}>
                <td><code>{d.key}</code></td>
                <td>
                  <input className={err ? 'invalid' : 'short'} value={d.raw} title={err} onChange={(e) => edit(d.key, { raw: e.target.value })} />
                </td>
                <td><input value={d.description} onChange={(e) => edit(d.key, { description: e.target.value })} /></td>
                <td><button className="danger" onClick={() => remove(d.key)} title="Delete">✕</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="actions">
        <input placeholder="new_key" value={newKey} onChange={(e) => setNewKey(e.target.value.trim())} />
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

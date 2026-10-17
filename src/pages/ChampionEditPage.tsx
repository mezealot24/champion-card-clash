import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import type { ChampionRow, ChampionStyleRow } from '../lib/database.types'
import { DeckEditor } from '../components/DeckEditor'
import { SaveButton } from '../components/SaveButton'

export function ChampionEditPage() {
  const { id = '' } = useParams()
  const { data, error, reload } = useAsync(async () => {
    const [champion, styles] = await Promise.all([
      supabase.from('champions').select('*').eq('id', id).single(),
      supabase.from('champion_styles').select('*').eq('champion_id', id).order('slot'),
    ])
    return { champion: must(champion), styles: must(styles) }
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <>
      <p><Link to="/admin">← Champions</Link></p>
      {/* key remounts the form with fresh state after each save */}
      <ChampionForm key={data.champion.updated_at} champion={data.champion} styles={data.styles} onSaved={reload} />
      <DeckEditor championId={id} />
    </>
  )
}

function ChampionForm(props: { champion: ChampionRow; styles: ChampionStyleRow[]; onSaved: () => void }) {
  const [champion, setChampion] = useState(props.champion)
  const [styles, setStyles] = useState(props.styles)

  const set = <K extends keyof ChampionRow>(k: K, v: ChampionRow[K]) => setChampion({ ...champion, [k]: v })
  const setStyle = (slot: number, patch: Partial<ChampionStyleRow>) =>
    setStyles(styles.map((s) => (s.slot === slot ? { ...s, ...patch } : s)))

  const invalid = champion.hp_max < champion.hp_start ? 'HP max ต้อง ≥ HP start' : null

  async function save() {
    const { id, name, archetype, hp_start, hp_max, identity, signature_combo } = champion
    must(await supabase.from('champions').update({ name, archetype, hp_start, hp_max, identity, signature_combo }).eq('id', id))
    must(await supabase.from('champion_styles').upsert(
      styles.map(({ champion_id, slot, name, effect }) => ({ champion_id, slot, name, effect })),
      { onConflict: 'champion_id,slot' },
    ))
    props.onSaved()
  }

  return (
    <div className="panel">
      <h2>Champion <code>{champion.id}</code></h2>
      <div className="grid">
        <label>Name<input value={champion.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Archetype<input value={champion.archetype} onChange={(e) => set('archetype', e.target.value)} /></label>
        <label>HP start<input type="number" min={1} value={champion.hp_start} onChange={(e) => set('hp_start', Number(e.target.value))} /></label>
        <label>HP max<input type="number" min={1} value={champion.hp_max} onChange={(e) => set('hp_max', Number(e.target.value))} /></label>
      </div>
      <label>Identity<textarea rows={2} value={champion.identity} onChange={(e) => set('identity', e.target.value)} /></label>
      <label>Signature combo<input value={champion.signature_combo} onChange={(e) => set('signature_combo', e.target.value)} /></label>

      <h3>Styles (เลือก 1 จาก 2)</h3>
      {styles.map((s) => (
        <div className="grid style-row" key={s.slot}>
          <label>Style {s.slot} name<input value={s.name} onChange={(e) => setStyle(s.slot, { name: e.target.value })} /></label>
          <label className="wide">Effect<textarea rows={2} value={s.effect} onChange={(e) => setStyle(s.slot, { effect: e.target.value })} /></label>
        </div>
      ))}
      {invalid && <p className="error">{invalid}</p>}
      <SaveButton onSave={save} disabled={!!invalid} />
    </div>
  )
}

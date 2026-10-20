import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import type { ChampionRow, ChampionStyleRow } from '../lib/database.types'
import { DeckEditor } from '../components/DeckEditor'
import { SaveButton } from '../components/SaveButton'
import { TextPreview, TuningFields } from '../components/TuningFields'
import { cleanParams, isTuningGroup, resolveTuning, STYLES, tuningErrors, unknownPlaceholders } from '../engine'

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

  // tuning groups: the class ("TK") and each Style ("TK:1"); a Style the engine doesn't know has no numbers
  const classGroup = isTuningGroup(champion.id) ? champion.id : null
  const styleGroup = (slot: number) => {
    const g = `${champion.id}:${slot}`
    return isTuningGroup(g) ? g : null
  }
  const tuningErr = [
    ...(classGroup ? tuningErrors(classGroup, champion.params ?? {}) : []),
    ...styles.flatMap((s) => {
      const g = styleGroup(s.slot)
      return g ? tuningErrors(g, s.params ?? {}) : []
    }),
  ]
  // the numbers as this draft would play them, for the text previews ({shatterPct} → 15)
  const draftTuning = resolveTuning({ [champion.id]: champion.params ?? {}, ...Object.fromEntries(styles.map((s) => [`${s.champion_id}:${s.slot}`, s.params ?? {}])) })
  const extra = { hpStart: champion.hp_start, hpMax: champion.hp_max }
  const textErr = [
    ...unknownPlaceholders(champion.signature_combo, champion.id, Object.keys(extra)),
    ...styles.flatMap((s) => unknownPlaceholders(s.effect, `${s.champion_id}:${s.slot}`, Object.keys(extra))),
  ]
  const invalid =
    champion.hp_max < champion.hp_start
      ? 'HP max must be ≥ HP start'
      : (tuningErr[0] ?? (textErr.length ? `Unknown number in text: ${textErr.join(' ')}` : null))

  async function save() {
    const { id, name, archetype, hp_start, hp_max, identity, signature_combo } = champion
    const params = classGroup ? cleanParams(classGroup, champion.params ?? {}) : (champion.params ?? {})
    must(await supabase.from('champions').update({ name, archetype, hp_start, hp_max, identity, signature_combo, params }).eq('id', id))
    must(await supabase.from('champion_styles').upsert(
      styles.map(({ champion_id, slot, name, effect, params }) => {
        const g = styleGroup(slot)
        return { champion_id, slot, name, effect, params: g ? cleanParams(g, params ?? {}) : (params ?? {}) }
      }),
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
        <label>HP start<input type="number" inputMode="numeric" min={1} value={champion.hp_start} onChange={(e) => set('hp_start', Number(e.target.value))} /></label>
        <label>HP max<input type="number" inputMode="numeric" min={1} value={champion.hp_max} onChange={(e) => set('hp_max', Number(e.target.value))} /></label>
      </div>
      <label>Identity<textarea rows={2} value={champion.identity} onChange={(e) => set('identity', e.target.value)} /></label>
      <label>Signature combo<textarea rows={2} value={champion.signature_combo} onChange={(e) => set('signature_combo', e.target.value)} /></label>
      <TextPreview text={champion.signature_combo} group={champion.id} tuning={draftTuning} extra={extra} />

      {classGroup && (
        <>
          <h3>Class numbers (resource + signature combo)</h3>
          <p className="muted">Blank = default from the code. Changes apply to new games once saved; the Play link picks them up when it is republished.</p>
          <TuningFields group={classGroup} params={champion.params ?? {}} onChange={(p) => set('params', p)} />
        </>
      )}

      <h3>Styles (pick 1 of 2)</h3>
      {styles.map((s) => {
        const g = styleGroup(s.slot)
        return (
          <div key={s.slot} className="style-block">
            <div className="grid style-row">
              <label>Style {s.slot} name<input value={s.name} onChange={(e) => setStyle(s.slot, { name: e.target.value })} /></label>
              <label className="wide">Effect<textarea rows={3} value={s.effect} onChange={(e) => setStyle(s.slot, { effect: e.target.value })} /></label>
            </div>
            <TextPreview text={s.effect} group={`${s.champion_id}:${s.slot}`} tuning={draftTuning} extra={extra} />
            {g && (
              <details open={Object.keys(s.params ?? {}).length > 0}>
                <summary>{STYLES[g]?.name ?? s.name} numbers</summary>
                <p className="muted">Write numbers in the Effect text as {'{key}'} (e.g. {'{shatterPct}'}) and the text follows these values.</p>
                <TuningFields group={g} params={s.params ?? {}} onChange={(p) => setStyle(s.slot, { params: p })} />
              </details>
            )}
          </div>
        )
      })}
      <div className="sticky-bar">
        <SaveButton onSave={save} disabled={!!invalid} label="Save champion" />
        {invalid && <span className="error">{invalid}</span>}
      </div>
    </div>
  )
}

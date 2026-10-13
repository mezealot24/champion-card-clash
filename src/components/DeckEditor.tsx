import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import type { CardRow, CardType } from '../lib/database.types'
import { SaveButton } from './SaveButton'
import { downloadCsv, downloadJson } from '../lib/download'

const TYPES: CardType[] = ['P', 'K', 'S']
type EditableCard = Omit<CardRow, 'updated_at'>

function nextCardId(championId: string, cards: EditableCard[]) {
  const max = Math.max(0, ...cards.map((c) => Number(c.id.slice(3))))
  return `${championId}-${String(max + 1).padStart(3, '0')}`
}

export function DeckEditor({ championId }: { championId: string }) {
  const { data, error, reload } = useAsync(async () => {
    const [cards, config] = await Promise.all([
      supabase.from('cards').select('*').eq('champion_id', championId).order('sort_order'),
      supabase.from('game_config').select('key, value').in('key', ['deck_size', 'dmg_budget', 'dmg_budget_tank']),
    ])
    const cfg = Object.fromEntries(must(config).map((r) => [r.key, Number(r.value)]))
    return {
      cards: must(cards) as EditableCard[],
      deckSize: cfg.deck_size ?? 15,
      budget: championId === 'TK' ? cfg.dmg_budget_tank : cfg.dmg_budget,
    }
  }, [championId])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading deck…</p>
  // new object per load -> fresh editor state after each save
  return <DeckTable key={JSON.stringify(data.cards)} championId={championId} {...data} onSaved={reload} />
}

type DeckTableProps = { championId: string; cards: EditableCard[]; deckSize: number; budget?: number; onSaved: () => void }

function DeckTable({ championId, deckSize, budget, onSaved, ...props }: DeckTableProps) {
  const [cards, setCards] = useState(props.cards)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<CardType | ''>('')
  const [deckFilter, setDeckFilter] = useState<'all' | 'in' | 'out'>('all')

  const deckCount = cards.filter((c) => c.in_deck).reduce((n, c) => n + c.copies, 0)
  const q = query.trim().toLowerCase()
  const visible = cards.filter((c) =>
    (!q || [c.id, c.name, c.source, c.line, c.effect].some((v) => v.toLowerCase().includes(q))) &&
    (!typeFilter || c.type === typeFilter) &&
    (deckFilter === 'all' || c.in_deck === (deckFilter === 'in')),
  )
  // Max deck_size cards (counting copies) can be picked for battle
  const canPick = (c: EditableCard) => c.in_deck || deckCount + c.copies <= deckSize

  const edit = (id: string, patch: Partial<EditableCard>) => {
    setCards(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setDirty(new Set(dirty).add(id))
  }

  const addCard = () => {
    const id = nextCardId(championId, cards)
    const sort_order = Math.max(0, ...cards.map((c) => c.sort_order)) + 1
    setCards([...cards, {
      id, champion_id: championId, name: 'New card', source: '', line: '', type: 'P',
      dmg: 0, dmg_tct: null, dmg_tentative: true, effect: '', copies: 1, in_deck: false, sort_order,
    }])
    setDirty(new Set(dirty).add(id))
  }

  async function removeCard(id: string) {
    if (!confirm(`ลบการ์ด ${id}? (ลบถาวร ID นี้จะไม่ถูกใช้ซ้ำ)`)) return
    must(await supabase.from('cards').delete().eq('id', id))
    // keep other unsaved edits: drop the row locally instead of reloading
    setCards((prev) => prev.filter((c) => c.id !== id))
    setDirty((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function save() {
    const rows = cards.filter((c) => dirty.has(c.id))
    if (rows.length) must(await supabase.from('cards').upsert(rows))
    onSaved()
  }

  const totalCards = cards.reduce((n, c) => n + c.copies, 0)
  const deck = cards.filter((c) => c.in_deck)
  const totalDmg = deck.reduce((n, c) => n + c.dmg * c.copies, 0)
  const byType = TYPES.map((t) => `${t} ${deck.filter((c) => c.type === t).reduce((n, c) => n + c.copies, 0)}`).join(' / ')

  return (
    <div className="panel">
      <h2>Deck</h2>
      <p className="summary">
        <span className={deckCount === deckSize ? 'ok' : 'warn'}>In deck {deckCount} / {deckSize}</span>
        <span className="muted">Pool {totalCards}</span>
        <span>Total dmg {totalDmg}{budget ? ` (budget ~${budget}, ยังไม่ล็อก)` : ''}</span>
        <span>{byType}</span>
      </p>
      <div className="filters">
        <input placeholder="Search ID / name / effect…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CardType | '')}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={deckFilter} onChange={(e) => setDeckFilter(e.target.value as 'all' | 'in' | 'out')}>
          <option value="all">All cards</option>
          <option value="in">In deck</option>
          <option value="out">Not in deck</option>
        </select>
        <span className="muted">{visible.length} shown</span>
        <span className="spacer" />
        <button className="secondary" onClick={() => downloadJson(`${championId}-cards.json`, cards)}>Export JSON</button>
        <button className="secondary" onClick={() => downloadCsv(`${championId}-cards.csv`, cards)}>Export CSV</button>
      </div>
      <div className="table-scroll">
        <table className="deck">
          <thead>
            <tr>
              <th title="เอาไปสู้">Deck</th><th>ID</th><th>Name</th><th>Source</th><th>สาย</th><th>Type</th><th>dmg</th><th>?</th>
              <th>TCT</th><th>Copies</th><th>Effect</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className={dirty.has(c.id) ? 'dirty' : undefined}>
                <td title={canPick(c) ? 'เลือกไปสู้' : `deck เต็ม ${deckSize} ใบแล้ว`}>
                  <input type="checkbox" checked={c.in_deck} disabled={!canPick(c)} onChange={(e) => edit(c.id, { in_deck: e.target.checked })} />
                </td>
                <td><code>{c.id}</code></td>
                <td><input value={c.name} onChange={(e) => edit(c.id, { name: e.target.value })} /></td>
                <td><input className="short" value={c.source} onChange={(e) => edit(c.id, { source: e.target.value })} /></td>
                <td><input className="short" value={c.line} onChange={(e) => edit(c.id, { line: e.target.value })} /></td>
                <td>
                  <select value={c.type} onChange={(e) => edit(c.id, { type: e.target.value as CardType })}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="num" type="number" min={0} value={c.dmg} onChange={(e) => edit(c.id, { dmg: Number(e.target.value) })} /></td>
                <td title="ค่าชั่วคราว รอ Q ตั้ง">
                  <input type="checkbox" checked={c.dmg_tentative} onChange={(e) => edit(c.id, { dmg_tentative: e.target.checked })} />
                </td>
                <td className="muted">{c.dmg_tct ?? '–'}</td>
                <td><input className="num" type="number" min={1} max={4} value={c.copies} onChange={(e) => edit(c.id, { copies: Number(e.target.value) })} /></td>
                <td><textarea rows={1} value={c.effect} onChange={(e) => edit(c.id, { effect: e.target.value })} /></td>
                <td><button className="danger" onClick={() => removeCard(c.id)} title="Delete">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button className="secondary" onClick={addCard}>+ Add card</button>
        <SaveButton onSave={save} disabled={dirty.size === 0} label={`Save ${dirty.size || ''} change${dirty.size === 1 ? '' : 's'}`} />
      </div>
    </div>
  )
}

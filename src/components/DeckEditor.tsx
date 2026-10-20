import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import { CARD_TAGS, type CardRow, type CardTag, type CardType } from '../lib/database.types'
import { SaveButton } from './SaveButton'
import { downloadCsv, downloadJson } from '../lib/download'
import { EffectBuilder } from './EffectBuilder'

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
      deckSize: cfg.deck_size ?? 20,
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
  const [tagFilter, setTagFilter] = useState<CardTag | ''>('')
  const [deckFilter, setDeckFilter] = useState<'all' | 'in' | 'out'>('all')

  // a Style's own cards (style_only "MG:1") replace the "!MG:1" ones, so count the deck every other Style plays
  const deckCount = cards.filter((c) => c.in_deck && !(c.style_only && !c.style_only.startsWith('!'))).reduce((n, c) => n + c.copies, 0)
  const q = query.trim().toLowerCase()
  const visible = cards.filter((c) =>
    (!q || [c.id, c.name, c.source, c.effect].some((v) => v.toLowerCase().includes(q))) &&
    (!typeFilter || c.type === typeFilter) &&
    (!tagFilter || c.tags.includes(tagFilter)) &&
    (deckFilter === 'all' || c.in_deck === (deckFilter === 'in')),
  )
  // Max deck_size cards (counting copies) can be picked for battle
  const canPick = (c: EditableCard) => c.in_deck || (!!c.style_only && !c.style_only.startsWith('!')) || deckCount + c.copies <= deckSize

  const edit = (id: string, patch: Partial<EditableCard>) => {
    setCards(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setDirty(new Set(dirty).add(id))
  }

  const addCard = () => {
    const id = nextCardId(championId, cards)
    const sort_order = Math.max(0, ...cards.map((c) => c.sort_order)) + 1
    setCards([...cards, {
      id, champion_id: championId, name: 'New card', source: '', line: '', tags: [], type: 'P',
      dmg: 0, dmg_tct: null, dmg_tentative: true, effect: '', effect_json: null, cost: null, copies: 1, in_deck: false, sort_order,
    }])
    setDirty(new Set(dirty).add(id))
  }

  async function removeCard(id: string) {
    if (!confirm(`Delete card ${id}? This is permanent and the ID won't be reused.`)) return
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
        <span>Total dmg {totalDmg}{budget ? ` (budget ~${budget}, not locked)` : ''}</span>
        <span>{byType}</span>
      </p>
      <div className="filters">
        <input type="search" aria-label="Search cards" placeholder="Search ID / name / effect…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CardType | '')}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value as CardTag | '')}>
          <option value="">All tags</option>
          {CARD_TAGS.map((t) => <option key={t}>{t}</option>)}
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
        <table className="deck cards-mobile">
          <thead>
            <tr>
              <th title="Plays in battle">Deck</th><th>ID</th><th>Name</th><th>Source</th><th>Tags</th><th>Type</th><th>dmg</th><th>?</th><th title="Resource cost when it strikes. Empty on an S card = class default (Mage 2 Mana, Bruiser 10 Rage, Assassin 1 Energy, Tank 10 HP)">Cost</th>
              <th title='"MG:1" = only under that Style · "!MG:1" = every Style but that one · empty = always'>Style</th><th title="Original damage before conversion">Base</th><th>Copies</th><th>Effect</th><th />
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className={dirty.has(c.id) ? 'dirty' : undefined}>
                <td className="c-pick" data-label="Deck" title={canPick(c) ? 'Play this card in battle' : `Deck is full (${deckSize} cards)`}>
                  <input type="checkbox" checked={c.in_deck} disabled={!canPick(c)} onChange={(e) => edit(c.id, { in_deck: e.target.checked })} />
                </td>
                <td className="c-id" data-label="ID"><code>{c.id}</code></td>
                <td className="c-name" data-label="Name"><input aria-label="Name" value={c.name} onChange={(e) => edit(c.id, { name: e.target.value })} /></td>
                <td className="c-src" data-label="Source"><input className="short" aria-label="Source" value={c.source} onChange={(e) => edit(c.id, { source: e.target.value })} /></td>
                <td className="c-tags" data-label="Tags">
                  <div className="tags">
                    {CARD_TAGS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={c.tags.includes(t) ? 'tag on' : 'tag'}
                        onClick={() => edit(c.id, { tags: c.tags.includes(t) ? c.tags.filter((x) => x !== t) : [...c.tags, t] })}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="c-type" data-label="Type">
                  <select aria-label="Type" value={c.type} onChange={(e) => edit(c.id, { type: e.target.value as CardType })}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td className="c-dmg" data-label="dmg"><input className="num" type="number" inputMode="numeric" aria-label="dmg" min={0} value={c.dmg} onChange={(e) => edit(c.id, { dmg: Number(e.target.value) })} /></td>
                <td className="c-tent" data-label="Tentative" title="Tentative number, not final yet">
                  <input type="checkbox" checked={c.dmg_tentative} onChange={(e) => edit(c.id, { dmg_tentative: e.target.checked })} />
                </td>
                <td className="c-cost" data-label="Cost">
                  <input
                    className="num"
                    type="number"
                    inputMode="numeric"
                    aria-label="Cost"
                    min={0}
                    placeholder={c.type === 'S' ? 'def' : ''}
                    value={c.cost ?? ''}
                    onChange={(e) => edit(c.id, { cost: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </td>
                <td className="c-style" data-label="Style"><input className="short" aria-label="Style" placeholder="all" value={c.style_only ?? ''} onChange={(e) => edit(c.id, { style_only: e.target.value.trim() || null })} /></td>
                <td className="c-tct muted" data-label="TCT">{c.dmg_tct ?? '–'}</td>
                <td className="c-copies" data-label="Copies"><input className="num" type="number" inputMode="numeric" aria-label="Copies" min={1} max={4} value={c.copies} onChange={(e) => edit(c.id, { copies: Number(e.target.value) })} /></td>
                <td className="c-effect" data-label="Effect">
                  <textarea rows={1} aria-label="Effect text" value={c.effect} onChange={(e) => edit(c.id, { effect: e.target.value })} />
                  <EffectBuilder
                    value={c.effect_json}
                    onChange={(effect_json) => edit(c.id, { effect_json })}
                    onUseText={(effect) => edit(c.id, { effect })}
                  />
                </td>
                <td className="c-del"><button className="danger" onClick={() => removeCard(c.id)} title="Delete card" aria-label={`Delete ${c.id}`}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions sticky-bar">
        <button className="secondary" onClick={addCard}>+ Add card</button>
        <SaveButton onSave={save} disabled={dirty.size === 0} label={`Save ${dirty.size || ''} change${dirty.size === 1 ? '' : 's'}`} />
      </div>
    </div>
  )
}

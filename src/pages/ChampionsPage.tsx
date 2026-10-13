import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'

export function ChampionsPage() {
  const { data, error } = useAsync(async () => {
    const [champions, cards] = await Promise.all([
      supabase.from('champions').select('*').order('sort_order'),
      supabase.from('cards').select('champion_id, dmg, copies').eq('in_deck', true),
    ])
    return { champions: must(champions), cards: must(cards) }
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <div className="panel">
      <h2>Champions</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Name</th><th>HP start / max</th><th>In deck</th><th>Total dmg</th><th />
          </tr>
        </thead>
        <tbody>
          {data.champions.map((c) => {
            const deck = data.cards.filter((card) => card.champion_id === c.id)
            return (
              <tr key={c.id}>
                <td><code>{c.id}</code></td>
                <td>{c.name}</td>
                <td>{c.hp_start} / {c.hp_max}</td>
                <td>{deck.reduce((n, card) => n + card.copies, 0)}</td>
                <td>{deck.reduce((n, card) => n + card.dmg * card.copies, 0)}</td>
                <td><Link to={`/champions/${c.id}`}>Edit</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

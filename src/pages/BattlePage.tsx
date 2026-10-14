import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import { Battle, type BattleData } from './Battle'

export function BattlePage() {
  const { data, error } = useAsync(async (): Promise<BattleData> => {
    const [champions, cards] = await Promise.all([
      supabase.from('champions').select('id, name, hp_start, hp_max').order('sort_order'),
      supabase.from('cards').select('*').order('sort_order'),
    ])
    return { champions: must(champions) as BattleData['champions'], cards: must(cards) as unknown as BattleData['cards'] }
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  return <Battle data={data} />
}

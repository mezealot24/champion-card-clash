import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import { Battle, type BattleData } from './Battle'

export function BattlePage() {
  const { data, error } = useAsync(async (): Promise<BattleData> => {
    const [champions, cards, styles, config] = await Promise.all([
      supabase.from('champions').select('id, name, hp_start, hp_max, params').order('sort_order'),
      supabase.from('cards').select('*').order('sort_order'),
      supabase.from('champion_styles').select('champion_id, slot, name, effect, params').order('slot'),
      supabase.from('game_config').select('key, value'),
    ])
    return {
      champions: must(champions) as BattleData['champions'],
      cards: must(cards) as unknown as BattleData['cards'],
      styles: must(styles) as BattleData['styles'],
      config: must(config),
    }
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  return <Battle data={data} />
}

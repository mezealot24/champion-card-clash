import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import { t, useLang } from '../i18n'
import { useState } from 'react'
import { betaUnlocked } from '../lib/beta'
import { Battle, type BattleData } from './Battle'
import { BetaGate } from './menu/BetaGate'

// Closed Beta: the access code comes first (no-op when VITE_BETA_CODE is unset)
export function BattlePage() {
  const [open, setOpen] = useState(betaUnlocked)
  return open ? <BattleLoader /> : <BetaGate onUnlock={() => setOpen(true)} />
}

function BattleLoader() {
  useLang()
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
  if (!data) return <p className="muted">{t('Loading…')}</p>
  return <Battle data={data} />
}

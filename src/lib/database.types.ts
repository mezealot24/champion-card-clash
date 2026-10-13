// Mirrors supabase/migrations. Regenerate with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'super_admin' | 'player'
export type CardType = 'P' | 'K' | 'S'

type Timestamps = { updated_at: string }

export type ChampionRow = {
  id: string
  name: string
  archetype: string
  hp_start: number
  hp_max: number
  identity: string
  signature_combo: string
  sort_order: number
} & Timestamps

export type ChampionStyleRow = {
  id: string
  champion_id: string
  slot: 1 | 2
  name: string
  effect: string
} & Timestamps

export type CardRow = {
  id: string
  champion_id: string
  name: string
  source: string
  line: string
  type: CardType
  dmg: number
  dmg_tct: number | null
  dmg_tentative: boolean
  effect: string
  copies: number
  in_deck: boolean
  sort_order: number
} & Timestamps

export type GameConfigRow = {
  key: string
  value: Json
  description: string
} & Timestamps

export type ProfileRow = {
  id: string
  role: AppRole
  created_at: string
}

type Table<Row, Required extends keyof Row> = {
  Row: Row
  Insert: Partial<Row> & Pick<Row, Required>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'id'>
      champions: Table<ChampionRow, 'id' | 'name' | 'archetype' | 'hp_start' | 'hp_max'>
      champion_styles: Table<ChampionStyleRow, 'champion_id' | 'slot'>
      cards: Table<CardRow, 'id' | 'champion_id' | 'name' | 'type'>
      game_config: Table<GameConfigRow, 'key' | 'value'>
    }
    Views: { [_ in never]: never }
    Functions: { is_super_admin: { Args: Record<string, never>; Returns: boolean } }
    Enums: { app_role: AppRole; card_type: CardType }
    CompositeTypes: { [_ in never]: never }
  }
}

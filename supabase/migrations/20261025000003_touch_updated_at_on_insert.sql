-- updated_at is set by the DB on insert too, so a client that sends updated_at: null
-- (bulk upsert fills missing keys with null) can't break the NOT NULL constraint
create or replace trigger champions_touch before insert or update on public.champions
  for each row execute function public.touch_updated_at();
create or replace trigger champion_styles_touch before insert or update on public.champion_styles
  for each row execute function public.touch_updated_at();
create or replace trigger cards_touch before insert or update on public.cards
  for each row execute function public.touch_updated_at();
create or replace trigger game_config_touch before insert or update on public.game_config
  for each row execute function public.touch_updated_at();

-- Champion tuning (Q 2026-10-18): super_admin tunes every Champion / Style number from the Admin console.
-- params holds only the numbers that differ from the engine defaults (src/engine/tuning.ts TUNING_FIELDS);
-- {} = the game as designed. DB wins over the code defaults. Existing RLS (public read, super_admin write) covers it.
alter table public.champions
  add column if not exists params jsonb not null default '{}'::jsonb
  constraint champions_params_object check (jsonb_typeof(params) = 'object');
alter table public.champion_styles
  add column if not exists params jsonb not null default '{}'::jsonb
  constraint champion_styles_params_object check (jsonb_typeof(params) = 'object');

comment on column public.champions.params is 'Tuning overrides for the class group (resource + signature combo), see src/engine/tuning.ts';
comment on column public.champion_styles.params is 'Tuning overrides for the Style group CHAMP:slot, see src/engine/tuning.ts';

-- start_hand was the one engine rule with no game_config row (the others exist since the init seed)
insert into public.game_config (key, value, description)
values ('start_hand', '0'::jsonb, 'Cards on the Field at the start (before Style extras like Sonic Bliz)')
on conflict (key) do nothing;

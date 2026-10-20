-- Loadout (Sigils + Ascendancy): Ascendancy points per Style, and the shared Minor Sigil numbers (engine/loadoutData.ts).
-- Oath and Ascendancy node numbers live in champions.params / champion_styles.params like other tuning (Admin → Champions).
insert into public.game_config (key, value, description) values
  ('asc_points', '5', 'Loadout: Ascendancy points per Style (Beta: all open)'),
  ('minor_second_breath_hp', '10', 'Minor Second Breath: Max HP +'),
  ('minor_head_start_res', '1', 'Minor Head Start: resource at start +'),
  ('minor_head_start_tank_hp', '10', 'Minor Head Start: Tank Max HP +'),
  ('minor_steady_draw', '1', 'Minor Steady Hands: extra draw'),
  ('minor_last_stand_hp_pct', '30', 'Minor Last Stand: HP line %'),
  ('minor_last_stand_dmg', '5', 'Minor Last Stand: slot 1 dmg +')
on conflict (key) do nothing;

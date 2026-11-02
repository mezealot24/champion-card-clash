-- Sonic Bliz Flurry rework (Q 2026-11-02, design/sonic-bliz-flurry-rework-2026-10-31.md, picks AAA).
-- Engine: Flurry action, Overdrive v2 (Skills allowed; Energy left after Skills → that many P/K cards get Flurry),
-- Redline per hit, Storm replaces Echo. This file: Style text, 2 cards get Flurry, new card AS-037.

-- 1. Sonic Bliz Style text (also carries PR #105's Shroud line)
update champion_styles set effect =
  'Start the game with {startDraw} cards on your Field. Acceleration: when you and the opponent both Strike, your Energy refills and you draw {dualDraw} at the end of the turn. Overdrive: Strike with {minChain}+ cards → spend the Energy left after Skills: that many Punch / Kick cards get Flurry, each hit +{dmgPerEnergy} dmg. Energy Surge: with full Energy at the start of the turn, Block or Charge spends it all. Block → Wraith Step: hits that get past your Block deal 1 dmg each. Charge → Shroud: no Charge break, and you draw {shroudDraw} more.',
  updated_at = now()
where champion_id = 'AS' and slot = 1;

-- 2. Veiled Flurry / Crossfire Flurry hit twice (once only, if run again)
update cards set
  effect = 'Flurry / ' || effect,
  effect_json = '[{"hook":"modify","do":[{"a":"flurry","target":"this"}]}]'::jsonb || coalesce(effect_json, '[]'::jsonb)
where id in ('AS-004', 'AS-006') and not coalesce(effect_json, '[]'::jsonb) @> '[{"do":[{"a":"flurry"}]}]'::jsonb;

-- 3. New Skill: Blade Storm (in_deck false: deck builder / Blitz Tempo preset only)
insert into cards (id, champion_id, name, source, line, type, dmg, effect, copies, sort_order, in_deck, tags, effect_json, cost) values
('AS-037', 'AS', 'Blade Storm', 'Claude', 'Speed', 'S', 10,
 'Flurry / Before action, if you play Strike with 4+ cards: this card ignores Block',
 1, 37, false, '{Speed,Attack}',
 '[{"hook":"modify","do":[{"a":"flurry","target":"this"}]},{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"chainLength","op":">=","n":4}],"do":[{"a":"pierce","target":"this"}]}]', 1)
on conflict (id) do nothing;

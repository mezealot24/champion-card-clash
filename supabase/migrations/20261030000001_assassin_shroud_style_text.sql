-- Assassin Energy Surge, Charge → Shroud (Q 2026-10-30): no more half dmg; each Style gets its own payoff.
-- Sonic Bliz draws {shroudDraw} more, Fatal Rhythm moves the Critical counter +{shroudCounter}. Wraith Step (Block) unchanged.
update champion_styles set effect = replace(effect,
  'Charge → Shroud: no Charge break, and hits on you deal half.',
  'Charge → Shroud: no Charge break, and you draw {shroudDraw} more.'),
  updated_at = now()
where champion_id = 'AS' and slot = 1;

update champion_styles set effect = replace(effect,
  'Charge → Shroud: no Charge break, and hits on you deal half.',
  'Charge → Shroud: no Charge break, and the Critical counter +{shroudCounter} (never past the next Critical).'),
  updated_at = now()
where champion_id = 'AS' and slot = 2;

-- Cryomancer rework (Q 2026-10-31 playtest): Shatter through Block + Frost Armor Chill per soaked hit is tunable.
-- Style text only; numbers come from params ({frostArmorChill}, {shatterBlockPct}). Ascendancy node text lives in code.
update champion_styles
set effect = replace(
      replace(effect,
        'Every hit a Shield soaks gives the attacker 1 Chill.',
        'Every hit a Shield soaks gives the attacker {frostArmorChill} Chill.'),
      'takes {shatterPct}% of their Max HP (their Block stops it).',
      'takes {shatterPct}% of their Max HP. If they Block your Strike, it still takes {shatterBlockPct}% of that.'),
    updated_at = now()
where champion_id = 'MG' and slot = 2;

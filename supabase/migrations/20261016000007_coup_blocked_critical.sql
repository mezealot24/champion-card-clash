-- Coup de grâce (Q 2026-10-16 18:04Z): a blocked Critical still deals 50% of its dmg.
-- Old text: 'Every 4th attack (counted across turns, blocked ones too) is a Critical: x3 dmg, x4 while the enemy''s HP is red (below 30% of Max HP).'
update champion_styles set effect = 'Every 4th attack (counted across turns, blocked ones too) is a Critical: x3 dmg, x4 while the enemy''s HP is red (below 30% of Max HP). A blocked Critical still deals 50% of its dmg.'
where champion_id = 'AS' and slot = 2;

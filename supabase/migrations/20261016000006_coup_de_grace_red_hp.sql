-- Assassin Coup de grâce buff (Q 2026-10-16 16:56Z): Critical x4 while the enemy HP is red (below 30% Max HP).
-- Old text: 'Every 4th attack (counted across turns, blocked ones too) is a Critical: x3 dmg.'
update champion_styles set effect = 'Every 4th attack (counted across turns, blocked ones too) is a Critical: x3 dmg, x4 while the enemy''s HP is red (below 30% of Max HP).'
where champion_id = 'AS' and slot = 2;

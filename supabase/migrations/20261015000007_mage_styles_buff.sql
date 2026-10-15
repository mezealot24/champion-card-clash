-- Mage Styles (Q picked 2026-10-15): Mana Flow (slot 1), Mana Barrier (slot 2). Every MG card +3 dmg.
update cards set dmg = dmg + 3 where id like 'MG-%';

update champion_styles set name = 'Mana Flow',
  effect = 'Charge draws 2 cards instead of 1 (not when your Charge is broken).'
where champion_id = 'MG' and slot = 1;

update champion_styles set name = 'Mana Barrier',
  effect = 'Start the game with Shield 30 (absorbs hit dmg until used up). Each turn you Block, your Shield is topped up to 8 if lower, lasting 2 turns.'
where champion_id = 'MG' and slot = 2;

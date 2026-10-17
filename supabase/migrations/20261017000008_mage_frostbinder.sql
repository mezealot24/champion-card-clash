-- Mage Style 2 Frostbinder replaces Mana Barrier (Q 2026-10-17: a Frost Style that slows Bruiser, makes it hit lighter and easier to read).
-- Numbers and the 4 Frost cards are Claude's draft (Q asked to go with Claude's picks); Frostbite and the other control cards stay.
-- MG-040..043 are in the deck only under Frostbinder; MG-005/006/012/023 leave the deck under Frostbinder to keep it at 25.
update public.champion_styles set name = 'Frostbinder', effect = 'Start the game with Shield 40 (absorbs hit dmg until used up). Frost Touch: every Skill card you paid for that hits clean gives the opponent 1 Chill. Glacial Guard: every Block gets Shield 10 this turn, and each hit it stops gives the attacker 1 Chill. Chill: each stack makes that side''s hits deal 15% less (3 turns). At 3 stacks the opponent is Frozen: Chill clears, Shatter takes 15% of their Max HP and they can''t Strike next turn.'
where champion_id = 'MG' and slot = 2;

update public.cards set style_only = '!MG:2' where id in ('MG-005', 'MG-006', 'MG-012', 'MG-023');

insert into public.cards (id, champion_id, name, source, line, type, dmg, effect, copies, sort_order, in_deck, tags, effect_json, cost, style_only) values
  ('MG-040', 'MG', 'Frost Jab', 'Claude', 'Frost', 'P', 8, 'After action, if you play Strike and this card hits clean: Opponent gains 1 Chill (each stack: hits deal 15% less, 3 turns; at 3 stacks Frozen: loses 15% Max HP and can''t Strike next turn)', 1, 40, true, '{Attack,Control}', '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"},{"c":"hitResult","r":"clean"}],"do":[{"a":"chill","who":"enemy","n":1}]}]'::jsonb, null, 'MG:2'),
  ('MG-041', 'MG', 'Ice Kick', 'Claude', 'Frost', 'K', 9, 'Before action, if opponent plays Strike: Facing card −3 dmg per Chill stack on opponent', 1, 41, true, '{Defend,Control}', '[{"hook":"modify","if":[{"c":"enemyAction","a":"strike"}],"do":[{"a":"addDmg","target":"facing","n":-3,"per":"enemyChill"}]}]'::jsonb, null, 'MG:2'),
  ('MG-042', 'MG', 'Cold Snap', 'Claude', 'Frost', 'S', 6, 'Before action, if you play Strike: Opponent gains 2 Chill (each stack: hits deal 15% less, 3 turns; at 3 stacks Frozen: loses 15% Max HP and can''t Strike next turn)', 1, 42, true, '{Spell,Control}', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"chill","who":"enemy","n":2}]}]'::jsonb, 1, 'MG:2'),
  ('MG-043', 'MG', 'Glacial Spike', 'Claude', 'Frost', 'S', 12, 'Before action, if you play Strike: This card +3 dmg per Chill stack on opponent', 1, 43, true, '{Spell,Attack}', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"addDmg","target":"this","n":3,"per":"enemyChill"}]}]'::jsonb, 2, 'MG:2')
on conflict (id) do update set name = excluded.name, type = excluded.type, dmg = excluded.dmg, effect = excluded.effect, effect_json = excluded.effect_json, cost = excluded.cost, style_only = excluded.style_only, in_deck = excluded.in_deck, tags = excluded.tags;

-- Molten Shield back to its first version (Q 2026-10-17 22:16Z): Block spends up to 3 Mana for Shield 5 per Mana
update public.champion_styles set effect = 'Touch of Flame: every Skill card you paid for that hits clean gives the opponent 1 Ignite (each stack burns 2 HP + 1% Max HP every turn and cuts heals 25%, max 50%; 3 turns, max 4 stacks). Molten Shield: when you Block with Mana, spend up to 3 Mana for Shield 5 per Mana this turn; each hit your Block stops gives the attacker 1 Ignite.'
where champion_id = 'MG' and slot = 1;

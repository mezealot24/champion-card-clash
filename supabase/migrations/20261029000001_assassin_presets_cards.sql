-- Assassin deck presets (Q 2026-10-29). Design: /mnt/project-files/design/assassin-deck-presets-2026-10-29.md
-- Backup of the changed rows: /mnt/project-files/backups/as-cards-before-presets-2026-10-29.md

-- 1. Card text drift: effect_json was buffed on 2026-10-27 but the text was not. Text now says what the card does.
update cards set effect = 'After action, if you play Strike and opponent has 3+ cards: Draw 2' where id = 'AS-007';
update cards set effect = 'After action, if you play Strike: Opponent loses 4 HP (ignores Block), draw 2' where id = 'AS-011';
update cards set effect = 'Before action, if you play Strike: All Kicks in your chain +5 dmg / Slot 3: this card x3 dmg' where id = 'AS-012';
update cards set effect = 'After action, if you play Strike, facing card is a Skill and opponent has 3+ cards on their Field: Opponent discards their card in this slot from the Field to the bottom of their deck (Cut), heal 5' where id = 'AS-027';
update cards set effect = 'Before action, if you play Strike: Next card (Kick only) +10 dmg / Slot 3: +12 dmg' where id = 'AS-029';
update cards set effect = 'Before action, if the opponent has 2+ cards on their Field: this card ignores Block, draw 2' where id = 'AS-030';

-- 2. Balance / naming
update cards set cost = 1 where id = 'AS-032'; -- Killer Instinct 2 → 1 (Death Rhythm runs 11 Skills on Energy cap 3)
update cards set name = 'Fast Hands' where id = 'AS-016'; -- was "Quickdraw", same name as the Assassin Oath

-- 3. New cards (in_deck false: deck builder / presets only, the Admin deck is unchanged)
insert into cards (id, champion_id, name, source, line, type, dmg, effect, copies, sort_order, in_deck, tags, effect_json, cost) values
('AS-033', 'AS', 'Afterimage', 'Claude', 'Speed', 'K', 8,
 'Before action, if you play Strike and opponent plays Block: this card ignores Block / After action, if you play Strike: Draw 1',
 1, 33, false, '{Speed}',
 '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"enemyAction","a":"block"}],"do":[{"a":"pierce","target":"this"}]},{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"draw","who":"self","n":1}]}]', null),
('AS-034', 'AS', 'Tailwind', 'Claude', 'Speed', 'P', 6,
 'Comes into play: draw 1. / After action, if you play Charge: gain 1 Energy',
 1, 34, false, '{Speed}',
 '[{"hook":"onDraw","do":[{"a":"draw","who":"self","n":1}]},{"hook":"onResolve","if":[{"c":"selfAction","a":"charge"}],"do":[{"a":"gainRes","who":"self","n":1}]}]', null),
('AS-035', 'AS', 'Counting Steps', 'Claude', 'Technique', 'P', 6,
 'Before action, if you play Strike: Fatal Rhythm Critical counter +1',
 1, 35, false, '{Technique}',
 '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"critCounter","n":1}]}]', null),
('AS-036', 'AS', 'Final Verdict', 'Claude', 'Technique', 'S', 10,
 'Before action, if you play Strike and the opponent''s HP is below 30% Max HP: this card x2 dmg and ignores Block',
 1, 36, false, '{Attack,Technique}',
 '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"hp","who":"enemy","op":"<","n":30,"pct":true}],"do":[{"a":"mulDmg","target":"this","pct":200},{"a":"pierce","target":"this"}]}]', 2);

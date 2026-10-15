-- Q 2026-10-15 16:39Z: decks go to 20 cards, every Champion +50 HP, Silence approved, Assassin gets speed + crit cards.
-- Run once: the HP update adds 50 each time it runs.

-- Deck size 20 (Admin deck editor reads this)
update public.game_config set value = '20'::jsonb, updated_at = now() where key = 'deck_size';

-- +50 HP (start and max) for every Champion. Tank Overgrowth's starting Max HP moves 160 → 210 in code.
update public.champions set hp_start = hp_start + 50, hp_max = hp_max + 50, updated_at = now();

-- Tank: TK-017 joins the deck (Mage v2 in the previous migration is already all in)
update public.cards set in_deck = true, updated_at = now() where id = 'TK-017';

-- New cards: Assassin 5 (speed + Critical / gain dmg), Bruiser 5, Tank 3 (TK-017 joins the deck above)
insert into public.cards (id, champion_id, name, source, line, type, dmg, effect, copies, sort_order, in_deck, tags, effect_json) values
  ('AS-015', 'AS', 'Shadow Step', 'Claude', 'Speed', 'P', 5, 'Comes into play: draw 1.', 1, 15, true, '{Speed}',
   '[{"hook":"onDraw","do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-016', 'AS', 'Quickdraw', 'Claude', 'Speed', 'K', 6, 'Every turn (Hold), at the start of the turn, if you play Charge: draw 1 (Charge draws 2).', 1, 16, true, '{Speed,Hold}',
   '[{"hook":"onHeld","at":"before","if":[{"c":"selfAction","a":"charge"}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-017', 'AS', 'Backstab', 'Claude', 'Technique', 'S', 10, 'Before action, if you play Strike and the opponent plays Charge: Critical, this card deals x2 dmg.', 1, 17, true, '{Attack,Technique}',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"enemyAction","a":"charge"}],"do":[{"a":"mulDmg","target":"this","pct":200}]}]'),
  ('AS-018', 'AS', 'Whetstone', 'Claude', 'Technique', 'K', 6, 'After action, if this card hit clean: it gains +4 dmg for the rest of the game (stacks).', 1, 18, true, '{Attack,Technique}',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"},{"c":"hitResult","r":"clean"}],"do":[{"a":"grow","n":4,"dur":"game","stack":true}]}]'),
  ('AS-019', 'AS', 'Death Mark', 'Claude', 'Technique', 'S', 8, 'Before action, if you play Strike with 4+ cards: Critical, this card deals x3 dmg.', 1, 19, true, '{Attack,Technique}',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"chainLength","op":">=","n":4}],"do":[{"a":"mulDmg","target":"this","pct":300}]}]'),
  ('BR-016', 'BR', 'Bloodlust', 'Claude', 'Attack', 'P', 12, 'After action, if this card hit clean: gain 6 HP.', 1, 16, true, '{Attack}',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"},{"c":"hitResult","r":"clean"}],"do":[{"a":"heal","who":"self","n":6}]}]'),
  ('BR-017', 'BR', 'Rampage', 'Claude', 'Attack', 'K', 14, 'Before action, if you play Strike and your HP < 50%: this card +12 dmg.', 1, 17, true, '{Attack}',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"hp","who":"self","op":"<","n":50,"pct":true}],"do":[{"a":"addDmg","target":"this","n":12}]}]'),
  ('BR-018', 'BR', 'Iron Will', 'Claude', 'Defend', 'P', 10, 'After action, if you play Block: gain 3 HP per hit you blocked.', 1, 18, true, '{Defend}',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"block"}],"do":[{"a":"heal","who":"self","n":3,"per":"hitBlocked"}]}]'),
  ('BR-019', 'BR', 'Crushing Blow', 'Claude', 'Attack', 'S', 25, 'Before action, if you play Strike and the opponent plays Block: their Block stops 1 fewer hit this turn, lose 5 HP.', 1, 19, true, '{Attack}',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"enemyAction","a":"block"}],"do":[{"a":"blockNow","who":"enemy","n":-1},{"a":"loseHp","who":"self","n":5}]}]'),
  ('BR-020', 'BR', 'Haymaker', 'Claude', 'Attack', 'P', 20, 'After action, if this card is blocked: it gains +10 dmg on its next attack.', 1, 20, true, '{Attack}',
   '[{"hook":"onResolve","if":[{"c":"hitResult","r":"blocked"}],"do":[{"a":"grow","n":10,"dur":"next"}]}]'),
  ('TK-018', 'TK', 'Stone Skin', 'Claude', 'Defend', 'P', 8, 'Before action, if the opponent plays Strike: all opponent''s cards -2 dmg.', 1, 18, true, '{Defend}',
   '[{"hook":"modify","if":[{"c":"enemyAction","a":"strike"}],"do":[{"a":"addDmg","target":"enemyAll","n":-2}]}]'),
  ('TK-019', 'TK', 'Fortify', 'Claude', 'Defend', 'K', 10, 'After action, if you play Block: Max HP +5 and gain 5 HP.', 1, 19, true, '{Defend}',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"block"}],"do":[{"a":"maxHp","who":"self","n":5},{"a":"heal","who":"self","n":5}]}]'),
  ('TK-020', 'TK', 'Taunt', 'Claude', 'Control', 'S', 12, 'After action, if this card hit clean: the opponent can''t Charge next turn.', 1, 20, true, '{Control}',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"},{"c":"hitResult","r":"clean"}],"do":[{"a":"status","who":"enemy","kind":"noCharge","turns":1}]}]')
on conflict (id) do update set
  champion_id = excluded.champion_id, name = excluded.name, source = excluded.source, line = excluded.line,
  type = excluded.type, dmg = excluded.dmg, effect = excluded.effect, copies = excluded.copies,
  sort_order = excluded.sort_order, in_deck = excluded.in_deck, tags = excluded.tags,
  effect_json = excluded.effect_json, updated_at = now();

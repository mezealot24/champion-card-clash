-- TK-017 (Q, 2026-10-14): S 20. Every turn (Hold), before attack, if opponent has 3+ cards: your Block stops 1 fewer hit this turn.
-- in_deck = false: Tank already has 16 cards in deck (max 15); Q picks which to drop.
insert into public.cards (id, champion_id, name, source, line, type, dmg, effect, copies, sort_order, in_deck, effect_json)
values ('TK-017', 'TK', 'TK-017', 'Q', 'Tank', 'S', 20,
  'Every turn (Hold), before attack, if opponent has 3+ cards: Your Block stops −1 hit this turn', 1, 17, false,
  '[{"hook":"onHeld","at":"before","if":[{"c":"enemyHandAtLeast","n":3}],"do":[{"a":"status","who":"self","kind":"blockPlus","n":-1,"turns":1}]}]')
on conflict (id) do nothing;

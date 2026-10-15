-- Bruiser drawbacks (Q 2026-10-15): keep dmg and HP, add a cost to the 5 strongest cards.
-- Exhaust (BR-015, BR-013): after you Strike with it, next turn you can't Block and take 50% more dmg from hits.
-- Recoil (BR-009, BR-003): if this card is blocked, lose 30 HP.
-- Scar (BR-014): after you Strike with it, Max HP -20 for the rest of the game.
update cards set
  effect_json = effect_json || '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"status","who":"self","kind":"noBlock","turns":1},{"a":"status","who":"self","kind":"vulnerable","turns":1,"n":50}]}]'::jsonb,
  effect = effect || ' / Exhaust: after action, if you play Strike: next turn you can''t Block and take 50% more dmg from hits'
where id in ('BR-015', 'BR-013');

update cards set
  effect_json = effect_json || '[{"hook":"onResolve","if":[{"c":"hitResult","r":"blocked"}],"do":[{"a":"loseHp","who":"self","n":30}]}]'::jsonb,
  effect = effect || ' / Recoil: after action, if this card is blocked: lose 30 HP'
where id in ('BR-009', 'BR-003');

update cards set
  effect_json = effect_json || '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"maxHp","who":"self","n":-20}]}]'::jsonb,
  effect = effect || ' / Scar: after action, if you play Strike: Max HP -20'
where id = 'BR-014';

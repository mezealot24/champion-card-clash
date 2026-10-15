-- Bruiser rework (Q, 2026-10-15): BR-003, 008, 009, 012, 013, 014, 015. BR-010 unchanged.
-- "Before attack" rules add "you play Strike" so they don't fire while the card sits on the Field
-- (BR-013 is the exception: it fires while held when you Charge).
update cards c set type = v.type::public.card_type, dmg = v.dmg, effect = v.effect, effect_json = v.spec::jsonb
from (values
  ('BR-003', 'K', 19, 'Before attack, if you play Strike and there is a facing card: Lose 6 HP, this card +30 dmg', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"hasFacing"}],"do":[{"a":"loseHp","who":"self","n":6},{"a":"addDmg","target":"this","n":30}]}]'),
  ('BR-008', 'P', 8, 'Before attack, if you play Strike: Opponent''s Block stops 2 fewer hits this turn', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"blockNow","who":"enemy","n":-2}]}]'),
  ('BR-009', 'P', 30, 'Before attack, if you play Strike and opponent plays Block: Lose 10 HP', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"enemyAction","a":"block"}],"do":[{"a":"loseHp","who":"self","n":10}]}]'),
  ('BR-012', 'P', 15, 'After attack, if this card is blocked: Opponent lose 10 HP', '[{"hook":"onResolve","if":[{"c":"hitResult","r":"blocked"}],"do":[{"a":"loseHp","who":"enemy","n":10}]}]'),
  ('BR-013', 'S', 45, 'Before attack, if you play Charge and opponent''s HP > 90: Lose 20 HP', '[{"hook":"modify","if":[{"c":"selfAction","a":"charge"},{"c":"hp","who":"enemy","op":">","n":90}],"do":[{"a":"loseHp","who":"self","n":20}]}]'),
  ('BR-014', 'K', 30, 'Before attack, if you play Strike and your HP < 30%: This card +20 dmg', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"hp","who":"self","op":"<","n":30,"pct":true}],"do":[{"a":"addDmg","target":"this","n":20}]}]'),
  ('BR-015', 'S', 60, 'After attack, if you had 2+ cards (this one included) when this card came into play: Lose 30 HP', '[{"hook":"onResolve","if":[{"c":"enteredWith","n":2}],"do":[{"a":"loseHp","who":"self","n":30}]}]')
) as v(id, type, dmg, effect, spec)
where c.id = v.id;

-- Q 2026-10-15 16:53Z: Tank cards get Shield, Parry and other conditions for variety.
-- Shield N = absorbs N dmg from hits before HP (from After action it lasts through next turn).
-- Parry N = this turn, the first N hits that get past your Block deal 0 and their dmg goes back to the attacker.
-- Reworks TK-006/007/008/012 (old draw/heal fillers) and TK-019 (Fortify → Spiked Guard). Dmg unchanged.
update public.cards c set name = v.name, effect = v.effect, effect_json = v.spec::jsonb, updated_at = now()
from (values
  ('TK-006', 'Shield Bash', 'Before action, if you play Strike and you have a Shield: this card +10 dmg.',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"hasStatus","who":"self","kind":"shield"}],"do":[{"a":"addDmg","target":"this","n":10}]}]'),
  ('TK-007', 'Counter Stance', 'Before action, if you play Block and the opponent plays Strike: gain Parry 1 this turn.',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"block"},{"c":"enemyAction","a":"strike"}],"do":[{"a":"status","who":"self","kind":"parry","turns":1,"n":1}]}]'),
  ('TK-008', 'Iron Guard', 'After action, if you play Strike: gain Shield 10 (lasts through next turn).',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"status","who":"self","kind":"shield","turns":1,"n":10}]}]'),
  ('TK-012', 'Riposte', 'Before action, if you play Charge and the opponent plays Strike: gain Parry 1 this turn.',
   '[{"hook":"modify","if":[{"c":"selfAction","a":"charge"},{"c":"enemyAction","a":"strike"}],"do":[{"a":"status","who":"self","kind":"parry","turns":1,"n":1}]}]'),
  ('TK-019', 'Spiked Guard', 'After action, if you play Block: the opponent loses 3 HP per hit you blocked.',
   '[{"hook":"onResolve","if":[{"c":"selfAction","a":"block"}],"do":[{"a":"loseHp","who":"enemy","n":3,"per":"hitBlocked"}]}]')
) as v(id, name, effect, spec)
where c.id = v.id;

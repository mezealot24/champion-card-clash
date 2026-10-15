-- Assassin: effect_json for the 13 AS cards that had none (AS-001 already has JSON). Keeps Admin edits.
-- Card text as it is in the DB on 2026-10-15; Q may rewrite cards later.
-- Claude defaults: "เมื่อออก" (when played) = in your Strike chain; no timing = After attack;
-- Before attack cards also need "you play Strike"; "Kick ทุกใบ" = following Kick cards in your chain.
update public.cards c set effect_json = v.spec::jsonb
from (values
  ('AS-002', '[{"hook":"onResolve","if":[{"c":"hitResult","r":"blocked"}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-003', '[{"hook":"onResolve","if":[{"c":"enemyAction","a":"charge"}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-004', '[{"hook":"onResolve","if":[{"c":"enemyAction","a":"strike"}],"do":[{"a":"draw","who":"self","n":2}]}]'),
  ('AS-005', '[{"hook":"onResolve","if":[{"c":"enemyAction","a":"block"}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-006', '[{"hook":"onResolve","do":[{"a":"draw","who":"self","n":2}]}]'),
  ('AS-007', '[{"hook":"onResolve","if":[{"c":"enemyHandAtLeast","n":3}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-008', '[{"hook":"onResolve","if":[{"c":"hp","who":"self","op":"<=","n":28}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('AS-009', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"addDmg","target":{"enemySlot":1},"n":-10}]}]'),
  ('AS-010', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"slotIs","n":4}],"do":[{"a":"addDmg","target":"facing","n":-20}]}]'),
  ('AS-011', '[{"hook":"onResolve","do":[{"a":"loseHp","who":"enemy","n":2}]}]'),
  ('AS-012', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"}],"do":[{"a":"addDmg","target":"following","n":2,"onlyType":"K"}]}]'),
  ('AS-013', '[{"hook":"modify","if":[{"c":"selfAction","a":"strike"},{"c":"hasFacing"}],"do":[{"a":"addDmg","target":"following","n":2,"onlyType":"K"}]}]'),
  ('AS-014', '[{"hook":"onResolve","if":[{"c":"hasFacing"}],"do":[{"a":"draw","who":"self","n":1},{"a":"loseHp","who":"self","n":3}]}]')
) as v(id, spec)
where c.id = v.id and c.effect_json is null;

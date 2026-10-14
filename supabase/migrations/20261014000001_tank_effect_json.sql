-- Tank: effect_json for all 16 TK cards. Only fills cards that have no JSON yet (keeps Admin edits).
-- No timing written = After attack; HP < 30 = HP ≤ 29. TK-004/005/011 = Q's rewrite (2026-10-14).
-- A held card's "After the attack" is the Hold timing (onHeld).
update public.cards c set effect_json = v.spec::jsonb
from (values
  ('TK-001', '[{"hook":"onResolve","if":[{"c":"slotIs","n":1}],"do":[{"a":"heal","who":"self","n":12}]}]'),
  ('TK-002', '[{"hook":"onResolve","if":[{"c":"slotIs","n":2}],"do":[{"a":"heal","who":"self","n":14}]}]'),
  ('TK-003', '[{"hook":"onResolve","if":[{"c":"slotIs","n":3}],"do":[{"a":"heal","who":"self","n":20}]}]'),
  ('TK-004', '[{"hook":"onHeld","if":[{"c":"selfAction","a":"charge"},{"c":"enemyAction","a":"strike"}],"do":[{"a":"heal","who":"self","n":8}]}]'),
  ('TK-005', '[{"hook":"modify","if":[{"c":"selfAction","a":"charge"}],"do":[{"a":"mulDmg","target":"enemyAll","pct":50,"onlyType":"K"}]}]'),
  ('TK-006', '[{"hook":"onResolve","if":[{"c":"enemyHandAtLeast","n":5}],"do":[{"a":"draw","who":"self","n":1},{"a":"heal","who":"self","n":8}]}]'),
  ('TK-007', '[{"hook":"onResolve","if":[{"c":"enemyAction","a":"strike"}],"do":[{"a":"draw","who":"self","n":1},{"a":"heal","who":"self","n":2}]}]'),
  ('TK-008', '[{"hook":"onResolve","do":[{"a":"draw","who":"self","n":1},{"a":"heal","who":"self","n":2}]}]'),
  ('TK-009', '[{"hook":"onHeld","if":[{"c":"selfAction","a":"block"},{"c":"enemyAction","a":"strike"}],"do":[{"a":"heal","who":"self","n":3,"per":"hitBlocked"}]}]'),
  ('TK-010', '[{"hook":"onDraw","do":[{"a":"heal","who":"both","n":8}]}]'),
  ('TK-011', '[{"hook":"onResolve","if":[{"c":"selfAction","a":"strike"},{"c":"tookDmg","n":1}],"do":[{"a":"heal","who":"self","n":10}]}]'),
  ('TK-012', '[{"hook":"onResolve","if":[{"c":"hitResult","r":"blocked"}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('TK-013', '[{"hook":"modify","do":[{"a":"addDmg","target":"following","n":6,"onlyType":"K"}]}]'),
  ('TK-014', '[{"hook":"onResolve","if":[{"c":"hpAtMost","n":29}],"do":[{"a":"heal","who":"self","n":20}],"once":true}]'),
  ('TK-015', '[{"hook":"onResolve","if":[{"c":"facingSameType"}],"do":[{"a":"maxHp","who":"self","n":-5},{"a":"heal","who":"self","n":10}]}]'),
  ('TK-016', '[{"hook":"onDraw","do":[{"a":"status","who":"self","kind":"blockPlus","n":1,"turns":1}]}]')
) as v(id, spec)
where c.id = v.id and c.effect_json is null;

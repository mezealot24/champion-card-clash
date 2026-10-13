-- Card effect as data: list of rules { hook, if?: [...], do: [...] } (see src/engine/effects/spec.ts).
-- null = no JSON (engine falls back to code in effects/registry.ts). `effect` stays the display text.
alter table public.cards
  add column effect_json jsonb
  check (effect_json is null or jsonb_typeof(effect_json) = 'array');

-- Bruiser defaults, same behaviour as the code registry, so they can be edited in the Admin form
update public.cards c set effect_json = v.spec::jsonb
from (values
  ('BR-001', '[{"hook":"onResolve","do":[{"a":"loseHp","who":"self","n":3}]}]'),
  ('BR-002', '[{"hook":"onResolve","if":[{"c":"enemyHandEmpty"}],"do":[{"a":"draw","who":"enemy","n":1}]}]'),
  ('BR-004', '[{"hook":"modify","if":[{"c":"hasFacing"}],"do":[{"a":"addDmg","target":"this","n":-4}]}]'),
  ('BR-005', '[{"hook":"onResolve","if":[{"c":"chainAll","type":"K"}],"do":[{"a":"draw","who":"both","n":1}]}]'),
  ('BR-006', '[{"hook":"modify","if":[{"c":"enemyHandAtLeast","n":4}],"do":[{"a":"addDmg","target":"next","n":2}]}]'),
  ('BR-007', '[{"hook":"onResolve","do":[{"a":"draw","who":"both","n":1}]}]'),
  ('BR-008', '[{"hook":"onResolve","if":[{"c":"enemyAction","a":"strike"},{"c":"enemyChainAtLeast","n":3}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('BR-009', '[{"hook":"onResolve","if":[{"c":"chainLength","op":"=","n":1}],"do":[{"a":"draw","who":"self","n":1}]}]'),
  ('BR-010', '[{"hook":"onResolve","if":[{"c":"enemyHandAtLeast","n":2}],"do":[{"a":"heal","who":"self","n":10}]}]'),
  ('BR-011', '[{"hook":"modify","if":[{"c":"chainAll","type":"P"}],"do":[{"a":"addDmg","target":{"slot":3},"n":8}]}]')
) as v(id, spec)
where c.id = v.id;

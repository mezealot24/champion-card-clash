-- Q 2026-10-17: new timing "On hit" (hook onHit) fires right after the card's own hit, between hits.
-- Tank heals that came from the card's own attack move from After action to On hit, so a heal can land
-- before the enemy's next hit instead of being wasted on a lethal turn. "You play Strike" is implied by On hit.
-- Other rules on these cards are unchanged. Backup: /mnt/project-files/backups/tk-heals-before-onhit-2026-10-17.md
update public.cards c set effect = v.effect, effect_json = v.spec::jsonb, updated_at = now()
from (values
  ('TK-001', 'On hit, if this card is in slot 1: Gain 2 HP, gain 3% of your Max HP as HP',
   '[{"hook":"onHit","do":[{"a":"heal","n":2,"who":"self"},{"a":"heal","n":3,"who":"self","per":"maxHpPct"}],"if":[{"c":"slotIs","n":1}]}]'),
  ('TK-002', 'On hit, if this card is in slot 2: Gain 2 HP, gain 4% of your Max HP as HP',
   '[{"hook":"onHit","do":[{"a":"heal","n":2,"who":"self"},{"a":"heal","n":4,"who":"self","per":"maxHpPct"}],"if":[{"c":"slotIs","n":2}]}]'),
  ('TK-003', 'On hit, if this card is in slot 3: Gain 2 HP, gain 6% of your Max HP as HP',
   '[{"hook":"onHit","do":[{"a":"heal","n":2,"who":"self"},{"a":"heal","n":6,"who":"self","per":"maxHpPct"}],"if":[{"c":"slotIs","n":3}]}]'),
  ('TK-005', 'Before action, if you play Charge: All opponent''s Kick cards lose 50% dmg / On hit, if this card hits clean: Gain 4 HP',
   '[{"hook":"modify","do":[{"a":"mulDmg","pct":50,"target":"enemyAll","onlyType":"K"}],"if":[{"a":"charge","c":"selfAction"}]},{"hook":"onHit","do":[{"a":"heal","n":4,"who":"self"}],"if":[{"c":"hitResult","r":"clean"}]}]'),
  ('TK-006', 'Before action, if you play Strike and you have Shield: This card +10 dmg / On hit, if this card hits clean and you have Shield: Gain 5 HP',
   '[{"hook":"modify","do":[{"a":"addDmg","n":10,"target":"this"}],"if":[{"a":"strike","c":"selfAction"},{"c":"hasStatus","who":"self","kind":"shield"}]},{"hook":"onHit","do":[{"a":"heal","n":5,"who":"self"}],"if":[{"c":"hitResult","r":"clean"},{"c":"hasStatus","who":"self","kind":"shield"}]}]'),
  ('TK-008', 'After action, if you play Strike: Gain Shield 10 (absorbs hit dmg, lasts through next turn) / On hit, if this card is blocked: Gain 4 HP',
   '[{"hook":"onResolve","do":[{"a":"status","n":10,"who":"self","kind":"shield","turns":1}],"if":[{"a":"strike","c":"selfAction"}]},{"hook":"onHit","do":[{"a":"heal","n":4,"who":"self"}],"if":[{"c":"hitResult","r":"blocked"}]}]'),
  ('TK-011', 'On hit, if you take dmg from a hit this turn: Gain 2 HP, gain 3% of your Max HP as HP',
   '[{"hook":"onHit","do":[{"a":"heal","n":2,"who":"self"},{"a":"heal","n":3,"who":"self","per":"maxHpPct"}],"if":[{"c":"tookDmg","n":1}]}]'),
  ('TK-013', 'Before action: All following cards (Kick only) +6 dmg / On hit: Gain 2 HP per Kick in your chain',
   '[{"hook":"modify","do":[{"a":"addDmg","n":6,"target":"following","onlyType":"K"}]},{"hook":"onHit","do":[{"a":"heal","n":2,"who":"self","per":"chainK"}]}]'),
  ('TK-014', 'On hit, if your HP ≤ 29: Gain 2 HP, gain 10% of your missing HP as HP (once per game)',
   '[{"hook":"onHit","do":[{"a":"heal","n":2,"who":"self"},{"a":"heal","n":10,"who":"self","per":"missingHpPct"}],"if":[{"c":"hpAtMost","n":29}],"once":true}]'),
  ('TK-015', 'On hit, if facing card is the same type: Max HP −5, gain 2 HP, gain 3% of your Max HP as HP',
   '[{"hook":"onHit","do":[{"a":"maxHp","n":-5,"who":"self"},{"a":"heal","n":2,"who":"self"},{"a":"heal","n":3,"who":"self","per":"maxHpPct"}],"if":[{"c":"facingSameType"}]}]'),
  ('TK-020', 'After action, if you play Strike and this card hits clean: Opponent can''t Charge next turn / On hit, if this card hits clean: Gain 4 HP',
   '[{"hook":"onResolve","do":[{"a":"status","who":"enemy","kind":"noCharge","turns":1}],"if":[{"a":"strike","c":"selfAction"},{"c":"hitResult","r":"clean"}]},{"hook":"onHit","do":[{"a":"heal","n":4,"who":"self"}],"if":[{"c":"hitResult","r":"clean"}]}]'),
  ('TK-022', 'On hit: Gain 4 HP per Punch in your chain',
   '[{"hook":"onHit","do":[{"a":"heal","n":4,"who":"self","per":"chainP"}]}]'),
  ('TK-023', 'Before action, if you play Strike and facing card is a Kick: This card dmg x3 / On hit, if this card hits clean: Gain 4 HP',
   '[{"hook":"modify","do":[{"a":"mulDmg","pct":300,"target":"this"}],"if":[{"a":"strike","c":"selfAction"},{"c":"facingIs","type":"K"}]},{"hook":"onHit","do":[{"a":"heal","n":4,"who":"self"}],"if":[{"c":"hitResult","r":"clean"}]}]')
) as v(id, effect, spec)
where c.id = v.id;

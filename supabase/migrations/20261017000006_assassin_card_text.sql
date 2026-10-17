-- Assassin cards (Q 2026-10-17 19:34Z): AS-019 renamed "Death Mark" → "Execution" so it no longer reads like the
-- Mark of Assassin combo; old Thai effect text on AS-001..AS-014 rewritten in English (same rules, text from describeSpec).
-- AS-003/007/008/013 are out of the deck but get English text too. AS-008's old text said draw 2; its rule draws 3, so the text now says 3.
update cards set name = 'Execution' where id = 'AS-019';
update cards set effect = v.effect from (values
  ('AS-001', 'After action, if this card hits clean: Draw 1'),
  ('AS-002', 'After action, if this card is blocked: Draw 1'),
  ('AS-003', 'After action, if you play Strike and opponent plays Charge: Draw 1'),
  ('AS-004', 'After action, if you play Strike and opponent plays Strike: Draw 2'),
  ('AS-005', 'After action, if you play Strike and opponent plays Block: Draw 1'),
  ('AS-006', 'After action, if you play Strike: Draw 2'),
  ('AS-007', 'After action, if you play Strike and opponent has 3+ cards: Draw 1'),
  ('AS-008', 'Every turn (Hold), start of turn, if your HP ≤ 28: Draw 3'),
  ('AS-009', 'Before action, if you play Strike: Opponent''s card in slot 1 −10 dmg'),
  ('AS-010', 'Before action, if you play Strike and this card is in slot 4: Facing card −20 dmg'),
  ('AS-011', 'After action, if you play Strike: Opponent loses 2 HP (ignores Block)'),
  ('AS-012', 'Before action, if you play Strike: All following cards (Kick only) +2 dmg'),
  ('AS-013', 'Before action, if you play Strike and there is a facing card: All following cards (Kick only) +2 dmg'),
  ('AS-014', 'After action, if you play Strike and there is a facing card: Draw 1, lose 3 HP')
) as v(id, effect) where cards.id = v.id;

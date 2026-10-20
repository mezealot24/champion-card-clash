-- IP cleanup (Q 2026-10-17): rename cards that mirrored Tekken Card Tournament move names, and Style names
-- that matched League of Legends runes. Game rules and numbers unchanged.
-- Backup of old names: /mnt/project-files/backups/card-names-before-ip-rename-2026-10-17.md
update cards c set name = v.new_name, updated_at = now()
from (values
  ('AS-001', 'Lucky Cut'),
  ('AS-002', 'Slip Away'),
  ('AS-003', 'Gale Jab'),
  ('AS-004', 'Crossfire Flurry'),
  ('AS-005', 'Hamstring'),
  ('AS-006', 'Veiled Flurry'),
  ('AS-007', 'Prowler Sweep'),
  ('AS-008', 'Desperate Gambit'),
  ('AS-009', 'Needle Jab'),
  ('AS-010', 'Rooftop Drop'),
  ('AS-011', 'Piercing Heel'),
  ('AS-012', 'Spur Kick'),
  ('AS-013', 'Flash Powder'),
  ('AS-014', 'Venom Thorn'),
  ('BR-001', 'Iron Heel'),
  ('BR-002', 'Coiled Reach'),
  ('BR-003', 'Sunbreak'),
  ('BR-004', 'Brass Knuckles'),
  ('BR-005', 'Twilight Sweep'),
  ('BR-006', 'War Drum'),
  ('BR-007', 'Wrecking Knee'),
  ('BR-008', 'Bear Claws'),
  ('BR-009', 'Reckless Combo'),
  ('BR-010', 'Summit Climb'),
  ('BR-011', 'Hammer Dance'),
  ('BR-012', 'Spearhead'),
  ('BR-013', 'Gut Buster'),
  ('BR-014', 'Blood Moon'),
  ('BR-015', 'Berserk Blast'),
  ('TK-001', 'Bark Skin'),
  ('TK-002', 'Mending Palm'),
  ('TK-003', 'Deep Roots'),
  ('TK-004', 'Steady Resolve'),
  ('TK-005', 'Thorn Knee'),
  ('TK-006', 'Bulwark Slam'),
  ('TK-007', 'Bracing Stance'),
  ('TK-008', 'Bastion Plate'),
  ('TK-009', 'Patient Defense'),
  ('TK-010', 'Earthshaker'),
  ('TK-011', 'Rebound Kick'),
  ('TK-012', 'Turn the Tide'),
  ('TK-013', 'Hobnail Boot'),
  ('TK-017', 'Hold the Line'),
  ('TK-022', 'Granite Fist')
) as v(id, new_name) where c.id = v.id;

update cards set source = 'Adapted' where source in ('Lili', 'Nina', 'Nina Base', 'Lili Base', 'Nina, Unique');

update champions set identity = replace(replace(identity, ' (ต้นแบบ Xiaoyu)', ''), ' (ต้นแบบ Nina)', '');

update champion_styles set name = 'Lifeline', updated_at = now() where champion_id = 'TK' and slot = 1 and name = 'Second Wind';
update champion_styles set name = 'Titan Bloom', updated_at = now() where champion_id = 'TK' and slot = 2 and name = 'Overgrowth';
update champion_styles set name = 'Fatal Rhythm', updated_at = now() where champion_id = 'AS' and slot = 2 and name = 'Coup de grâce';
update champion_styles set effect = replace(replace(replace(effect, 'Second Wind', 'Lifeline'), 'Conqueror', 'Momentum'), 'Omnivamp', 'Lifesteal')
  where champion_id in ('TK', 'BR');

-- Q 2026-10-16: combos fire as soon as the 3 card types are in the chain (any order, any position);
-- Sonic Bliz extra hits need only 1 clean hit (was 3).
update champions set signature_combo = replace(signature_combo, 'P > K > S :', 'P + K + S (ลำดับไหนก็ได้) :') where id = 'AS';
update champions set signature_combo = replace(replace(signature_combo, 'Combo 1 · S > P > P :', 'Combo 1 · S + P + P (ลำดับไหนก็ได้) :'), 'Combo 2 · S > K > K (Before action) :', 'Combo 2 · S + K + K (ลำดับไหนก็ได้) (Before action) :') where id = 'BR';
update champions set signature_combo = replace(signature_combo, 'S > S > S :', 'S + S + S (ลำดับไหนก็ได้) :') where id = 'TK';
update champions set signature_combo = replace(signature_combo, 'S+S+S clean ครบ 3', 'S+S+S (ลำดับไหนก็ได้) clean ครบ 3') where id = 'MG';
update champion_styles set effect = replace(effect, 'clean hit ครบ 3 ครั้งในสายเดียวกัน', 'clean hit อย่างน้อย 1 ครั้งในสายเดียวกัน') where champion_id = 'AS' and slot = 1;

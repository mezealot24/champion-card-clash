-- Q 2026-10-25 (thread "Tank buff และปรับเด็ค"): Tank Titan Bloom lost too hard to Pyromancer.
-- 1) Titan Bloom: end of every turn, + Max HP per debuff stack on the Tank (new Style field TK:2.perDebuff, default 2).
-- 2) Ignite: 0.5% Max HP per stack (was 1.5 in the DB) and heals cut 10% per stack (was 25). Applies to every matchup.
update public.champion_styles
set params = params || '{"ignitePctMaxHp": 0.5, "healCutPerStack": 10}'::jsonb, updated_at = now()
where champion_id = 'MG' and slot = 1;

update public.champion_styles
set effect = effect || E'\nEnd of every turn: + Max HP = {perDebuff} per debuff stack on you (each Ignite / Chill stack, Silence, Frozen, can''t Block / Charge, Vulnerable, Mark, Block −).', updated_at = now()
where champion_id = 'TK' and slot = 2 and effect not like '%{perDebuff}%';

-- Card text that spelled out the old Ignite numbers
update public.cards
set effect = replace(effect, '1% Max HP every turn and cuts heals 25%', '0.5% Max HP every turn and cuts heals 10%'), updated_at = now()
where effect like '%1\% Max HP every turn and cuts heals 25\%%';

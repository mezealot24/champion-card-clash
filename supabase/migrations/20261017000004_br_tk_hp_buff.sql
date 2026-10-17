-- Q 2026-10-17: Bruiser Max HP 190 -> 210 (starts full); Tank starting HP 210 -> 250 (Max stays 300).
update public.champions set hp_start = 210, hp_max = 210 where id = 'BR';
update public.champions set hp_start = 250 where id = 'TK';

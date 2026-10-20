-- Assassin combo renamed (Q 2026-10-17 14:00Z): Death Mark → Mark of Assassin, so it no longer clashes with card AS-019 "Death Mark".
update champions set signature_combo = 'P + K + S (any order, all clean): Mark of Assassin — the opponent is marked for the rest of the game. Every later Strike against them bursts for 50% of that chain''s total dmg, however much got through Block or Shield. Doesn''t stack.'
where id = 'AS';

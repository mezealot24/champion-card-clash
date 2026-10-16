-- Assassin (Q 2026-10-16 14:29Z): Overdrive from 3 cards; P > K > S combo now places Death Mark instead of True Damage.
-- Old combo text: 'P + K + S (ลำดับไหนก็ได้) : 3Turns ต่อไปได้ สถานะ True Damage ( เมื่อสร้างความเสียหายสำเร็จ จะไม่สามารถถูกหักล้างจากค่าพลังป้องกันใดๆได้ *ยกเว้น block* )'
update champions set signature_combo = 'P + K + S (any order, all clean): Death Mark — the opponent is marked for the rest of the game. Every later Strike against them bursts for 50% of that chain''s total dmg, however much got through Block or Shield. Doesn''t stack.'
where id = 'AS';
update champion_styles set effect = 'Start the game with 3 cards on your Field. Acceleration: when you and the opponent both Strike (Dual Strike), your Energy refills and you draw 2 cards at the end of the turn. Overdrive: Strike with 3+ cards and no S card → spend all your Energy, every card in the chain gets +2 dmg per Energy (works while Silenced).'
where champion_id = 'AS' and slot = 1;

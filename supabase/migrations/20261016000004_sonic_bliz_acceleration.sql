-- Sonic Bliz (Q 2026-10-16 07:00Z): Extra Hits replaced by Acceleration (Strike meets Strike → Energy full + draw 2).
-- Assassin Style text in English (UI text is English).
update champion_styles set effect = case slot
 when 1 then 'Start the game with 3 cards on your Field. Acceleration: when you and the opponent both Strike (Dual Strike), your Energy refills and you draw 2 cards at the end of the turn. Overdrive: Strike with a full Field (5 cards) and no S card → spend all your Energy, every card in the chain gets +2 dmg per Energy (works while Silenced).'
 when 2 then 'Every 4th attack (counted across turns, blocked ones too) is a Critical: x3 dmg.' end
where champion_id = 'AS';

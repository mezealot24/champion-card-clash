-- Keep the player-facing Fury rules aligned with the hybrid Style implementation:
-- Warm-up above the HP line, True Fury below it, and Chip Damage on stopped hits.
update public.champion_styles
set effect = $t$Warm-up: while HP is at or above {hpPct}% and Rage is at least {warmUpRage}, the first {slots} chain cards deal +{warmUpDmg} dmg. True Fury: below {hpPct}% HP, the first {slots} chain cards deal +{bonusDmg} dmg; stopped hits still deal {chipDmg} Chip Damage and give {chipRage} Rage.$t$,
    updated_at = now()
where champion_id = 'BR' and slot = 1;

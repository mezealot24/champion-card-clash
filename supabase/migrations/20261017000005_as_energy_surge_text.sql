-- Q 2026-10-17: show the Assassin Energy Surge rule (A+B, PR #37) in both Style texts.
update public.champion_styles
set effect = effect || ' Energy Surge: with full Energy at the start of the turn, Block or Charge spends it all. Block → Wraith Step: hits that get past your Block deal 1 dmg each. Charge → Shroud: no Charge break, and hits on you deal half.'
where champion_id = 'AS' and effect not like '%Energy Surge%';

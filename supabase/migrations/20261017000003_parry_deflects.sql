-- Parry deflects, it does not reflect (Q 2026-10-17): a parried hit deals 0 and nothing goes back to the attacker.
update public.cards
set effect = replace(effect, 'past Block deal 0 and go back to the attacker)', 'past Block is parried: 0 dmg)')
where effect like '%past Block deal 0 and go back to the attacker)%';

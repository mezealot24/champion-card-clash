-- Q 2026-10-15: "After attack" becomes "After action": end of turn, whatever action you picked
-- (Strike / Block / Charge), for every card on your Field. Same for "Before attack" → "Before action".
-- Cards keep working as before: every After action rule that didn't already check your action or
-- this card's hit result gets "you play Strike" added.
update public.cards c set effect_json = (
  select jsonb_agg(
    case
      when r->>'hook' = 'onResolve'
        and not exists (select 1 from jsonb_array_elements(coalesce(r->'if', '[]'::jsonb)) x where x->>'c' in ('selfAction', 'hitResult'))
      then jsonb_set(r, '{if}', jsonb_build_array(jsonb_build_object('c', 'selfAction', 'a', 'strike')) || coalesce(r->'if', '[]'::jsonb))
      else r
    end order by ord)
  from jsonb_array_elements(c.effect_json) with ordinality as t(r, ord)
)
where c.effect_json is not null
  and exists (
    select 1 from jsonb_array_elements(c.effect_json) r
    where r->>'hook' = 'onResolve'
      and not exists (select 1 from jsonb_array_elements(coalesce(r->'if', '[]'::jsonb)) x where x->>'c' in ('selfAction', 'hitResult'))
  );

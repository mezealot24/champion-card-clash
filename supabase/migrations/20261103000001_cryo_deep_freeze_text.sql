-- Cryomancer Deep Freeze (Q 2026-11-03): a Frozen opponent's Block stops only {frozenBlockHits} (default 0) of your hits.
-- Style text only; the number is champion_styles.params frozenBlockHits (Admin). Run after the code that reads it is live.
update champion_styles
set effect = replace(effect,
      'Shatter: your first clean hit on a Frozen opponent takes {shatterPct}% of their Max HP. If they Block your Strike, it still takes {shatterBlockPct}% of that.',
      'Deep Freeze: a Frozen opponent''s Block stops only {frozenBlockHits} of your hits. Shatter: your first clean hit on a Frozen opponent takes {shatterPct}% of their Max HP (through a Block: {shatterBlockPct}% of that).'),
    updated_at = now()
where champion_id = 'MG' and slot = 2;

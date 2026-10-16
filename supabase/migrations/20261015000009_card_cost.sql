-- S card resource system (Q 2026-10-15, thread "S card resource").
-- cards.cost = class resource paid when the card fires in a Strike chain (Mana / Rage / Energy, Tank pays HP).
-- Null on an S card = class default in src/engine/resources.ts (Mage 2, Bruiser 20, Assassin 1, Tank 10 HP).
alter table public.cards add column if not exists cost integer check (cost is null or cost >= 0);
comment on column public.cards.cost is 'Resource cost when it strikes. Null on an S card = class default (engine/resources.ts).';

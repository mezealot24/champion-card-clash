-- Card pool vs battle deck: cards stay in the pool, in_deck marks the ones taken into battle
alter table public.cards add column in_deck boolean not null default true;

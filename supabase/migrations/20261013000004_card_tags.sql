-- Card role tags (design aid only, no game rule yet). Enum = DB rejects typos.
-- Add a value later with: alter type public.card_tag add value 'NewTag';
create type public.card_tag as enum ('Attack', 'Defend', 'Speed', 'Technique', 'Spell', 'Hold', 'Control');

alter table public.cards add column tags public.card_tag[] not null default '{}';

-- carry over the old free-text "line" (สาย)
update public.cards set tags = array[line::public.card_tag]
where line in ('Attack', 'Defend', 'Speed', 'Technique', 'Spell', 'Hold', 'Control');

-- line is superseded by tags; kept for now so older app builds keep working
comment on column public.cards.line is 'deprecated: use tags';

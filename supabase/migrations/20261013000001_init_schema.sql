-- Champion Card Clash: game data + RBAC
-- Roles: super_admin can edit everything; everyone else can only read.

create type public.app_role as enum ('super_admin', 'player');
create type public.card_type as enum ('P', 'K', 'S');

-- 1 row per auth user; role defaults to player
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'player',
  created_at timestamptz not null default now()
);

create table public.champions (
  id text primary key check (id ~ '^[A-Z]{2}$'),          -- TK, AS, MG, BR
  name text not null,
  archetype text not null,
  hp_start int not null check (hp_start > 0),
  hp_max int not null check (hp_max >= hp_start),
  identity text not null default '',
  signature_combo text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.champion_styles (
  id uuid primary key default gen_random_uuid(),
  champion_id text not null references public.champions (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  name text not null default '',
  effect text not null default '',
  updated_at timestamptz not null default now(),
  unique (champion_id, slot)
);

-- Card ID is stable CLASS-NNN; duplicates share one ID with copies > 1
create table public.cards (
  id text primary key check (id ~ '^[A-Z]{2}-[0-9]{3}$'),
  champion_id text not null references public.champions (id) on delete cascade,
  name text not null,
  source text not null default '',
  line text not null default '',                         -- สาย e.g. Speed / Technique / Spell
  type public.card_type not null,
  dmg int not null default 0 check (dmg >= 0),
  dmg_tct int check (dmg_tct >= 0),
  dmg_tentative boolean not null default false,          -- ค่าที่มี "?" ใน vault
  effect text not null default '',
  copies smallint not null default 1 check (copies between 1 and 4),
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  check (left(id, 2) = champion_id)
);
create index cards_champion_id_idx on public.cards (champion_id);

create table public.game_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger champions_touch before update on public.champions
  for each row execute function public.touch_updated_at();
create trigger champion_styles_touch before update on public.champion_styles
  for each row execute function public.touch_updated_at();
create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();
create trigger game_config_touch before update on public.game_config
  for each row execute function public.touch_updated_at();

-- auto-create profile on signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RBAC helper (security definer so RLS on profiles does not recurse)
create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'super_admin'
  );
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.champions enable row level security;
alter table public.champion_styles enable row level security;
alter table public.cards enable row level security;
alter table public.game_config enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_super_admin()));
-- no insert/update/delete policy on profiles: roles change only via SQL editor

-- game data: anyone can read (the game client needs it), only super_admin writes
do $$
declare t text;
begin
  foreach t in array array['champions', 'champion_styles', 'cards', 'game_config'] loop
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "super_admin insert" on public.%I for insert to authenticated with check ((select public.is_super_admin()))', t);
    execute format('create policy "super_admin update" on public.%I for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()))', t);
    execute format('create policy "super_admin delete" on public.%I for delete to authenticated using ((select public.is_super_admin()))', t);
  end loop;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

# Champion Card Clash

Web card game (React + TypeScript + Vite) with Supabase as the data store.
This first slice is the **Super-admin console** for tuning game data:

- **Champions**: HP start/max, identity, signature combo, Style 1/2
- **Deck**: per-Champion card list (ID `CLASS-NNN`, P/K/S type, dmg, copies, effect), live totals vs `deck_size` and dmg budget (info only, not enforced)
- **Config**: global rule values (`hand_max`, `block_stops_hits`, ...) stored as JSON

Design docs stay in the Obsidian vault; Supabase is the source of truth for numbers.

## Setup

1. Apply `supabase/migrations/*.sql` to your Supabase project (schema + RLS, then seed of 4 Champions / 59 card IDs).
2. `cp .env.example .env` and fill URL + publishable key.
3. `npm install && npm run dev`, sign in with a magic link.
4. Promote yourself once in the SQL editor:
   ```sql
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = '<your email>');
   ```

## Security (RBAC)

- `profiles.role` is `player` by default; there is no RLS policy that lets users change it, so roles change only via SQL.
- Game tables are readable by anyone (the game client needs them) and writable only when `public.is_super_admin()` is true.
- The React guard is UX only; RLS is the real gate.

## Re-seeding from the vault

`python3 scripts/seed_from_vault.py "<vault>/04 Cards"` regenerates the card insert (checks each deck has 15 cards).

-- PitchPocket career store.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run).
--
-- Design notes:
-- * Rows are keyed by the client-generated hex ids the app already uses, so
--   local and remote records are the same records, not copies.
-- * Deletes are soft (a `deleted` flag) so an offline delete on one device
--   can't be resurrected by a later pull from another.
-- * Row Level Security scopes every row to the auth user that owns it —
--   the client talks to Supabase directly with the public anon key, and RLS
--   is what makes that safe.

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fixtures (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  opponent text not null,
  match_date timestamptz not null,
  competition text,
  created_at timestamptz not null,
  deleted boolean not null default false
);

-- turns: [{ "transcript": "...", "echoResponse": "..." }, ...] — a debrief is
-- a conversation, not a single exchange, so it's an ordered array rather
-- than flat transcript/echo_response columns.
create table if not exists public.debriefs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fixture_id text,
  turns jsonb not null,
  created_at timestamptz not null,
  deleted boolean not null default false
);

-- A node is only ever created from the player accepting one of Echo's
-- offers (see CLAUDE.md "Mind map") — it is never written by Echo directly.
create table if not exists public.mind_map_nodes (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  debrief_id text,
  created_at timestamptz not null,
  deleted boolean not null default false
);

create index if not exists fixtures_user_idx on public.fixtures (user_id);
create index if not exists debriefs_user_idx on public.debriefs (user_id);
create index if not exists mind_map_nodes_user_idx on public.mind_map_nodes (user_id);

alter table public.player_profiles enable row level security;
alter table public.fixtures enable row level security;
alter table public.debriefs enable row level security;
alter table public.mind_map_nodes enable row level security;

create policy "own profile" on public.player_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own fixtures" on public.fixtures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own debriefs" on public.debriefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own mind map nodes" on public.mind_map_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

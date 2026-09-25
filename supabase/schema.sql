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
-- summary: { "text": "...", "signals": ["...", ...] } — a compact,
-- AI-generated distillation regenerated after every turn, nullable since
-- older debriefs (or a failed summarize call) may not have one yet; the
-- client falls back to a raw-transcript excerpt when it's absent.
create table if not exists public.debriefs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fixture_id text,
  turns jsonb not null,
  created_at timestamptz not null,
  deleted boolean not null default false,
  summary jsonb
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

-- A focus block is a second, separate commitment beyond pinning a node —
-- the player choosing to actively train on an insight they already
-- recognised, not something created automatically. No delete: a dropped
-- focus stays as a record of what was tried, only its status changes.
create table if not exists public.focus_blocks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  node_id text not null,
  label text not null,
  plan jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null,
  deleted boolean not null default false
);

-- One row per player — a compact, evolving memory (durable facts, not a
-- transcript replay), regenerated wholesale by /api/update-memory at the
-- close of each debrief. Document semantics like flow_recipes: last-write-
-- wins by updated_at, nothing to merge.
create table if not exists public.player_memory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  facts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- One row per player — a curated, player-editable document (add/rewrite/
-- delete anything), not an append-only record collection like the tables
-- above. AI-drafted items become part of it through the same save path as
-- the player's own edits; there's no separate "pending AI suggestion" state
-- server-side.
create table if not exists public.flow_recipes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists fixtures_user_idx on public.fixtures (user_id);
create index if not exists debriefs_user_idx on public.debriefs (user_id);
create index if not exists mind_map_nodes_user_idx on public.mind_map_nodes (user_id);
create index if not exists focus_blocks_user_idx on public.focus_blocks (user_id);

alter table public.player_profiles enable row level security;
alter table public.fixtures enable row level security;
alter table public.debriefs enable row level security;
alter table public.mind_map_nodes enable row level security;
alter table public.focus_blocks enable row level security;
alter table public.player_memory enable row level security;
alter table public.flow_recipes enable row level security;

create policy "own profile" on public.player_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own fixtures" on public.fixtures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own debriefs" on public.debriefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own mind map nodes" on public.mind_map_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own focus blocks" on public.focus_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own player memory" on public.player_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own flow recipe" on public.flow_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

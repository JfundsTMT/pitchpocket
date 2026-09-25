-- One-time migration for a project deployed before player memory existed.
-- Purely additive — safe to run even with existing rows in other tables.
--
-- After running this, schema.sql matches the live database again — this
-- file only exists to carry an already-deployed project forward.

create table if not exists public.player_memory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  facts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_memory enable row level security;

create policy "own player memory" on public.player_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

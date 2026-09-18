-- One-time migration for a project deployed before focus blocks existed.
-- Purely additive — safe to run even with existing rows in other tables.
--
-- After running this, schema.sql matches the live database again — this
-- file only exists to carry an already-deployed project forward.

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

create index if not exists focus_blocks_user_idx on public.focus_blocks (user_id);

alter table public.focus_blocks enable row level security;

create policy "own focus blocks" on public.focus_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

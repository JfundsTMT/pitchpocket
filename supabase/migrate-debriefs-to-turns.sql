-- One-time migration: run once in the Supabase SQL Editor for a project
-- that already has the OLD debriefs schema (flat transcript/echo_response
-- columns). Safe to run even with existing rows — backfills them into the
-- new `turns` shape before dropping the old columns. Safe to re-run (each
-- step is idempotent / guarded).
--
-- After running this, schema.sql matches the live database again — this
-- file only exists to carry an already-deployed project forward; it is not
-- needed for a fresh install (schema.sql already has the new shape).

alter table public.debriefs add column if not exists turns jsonb;

update public.debriefs
set turns = jsonb_build_array(jsonb_build_object('transcript', transcript, 'echoResponse', echo_response))
where turns is null and transcript is not null;

alter table public.debriefs alter column turns set not null;

alter table public.debriefs drop column if exists transcript;
alter table public.debriefs drop column if exists echo_response;

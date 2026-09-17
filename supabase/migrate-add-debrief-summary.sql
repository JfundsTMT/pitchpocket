-- One-time migration for a project deployed before debrief summaries
-- existed. Purely additive and nullable — safe to run even with existing
-- rows; nothing is backfilled, old debriefs just have summary = null until
-- the client's fallback (raw-transcript excerpt) or a future re-summarize
-- covers them.
--
-- After running this, schema.sql matches the live database again — this
-- file only exists to carry an already-deployed project forward.

alter table public.debriefs add column if not exists summary jsonb;

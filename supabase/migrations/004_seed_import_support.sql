-- Opry Ops 1.0: support for the idempotent seed importer.
-- Additive only.

-- Seed shows have a date but no confirmed show time. Store the date without inventing a time;
-- starts_at stays null until a real show time is known (Etix / contract).
alter table public.events add column if not exists event_date date;

-- One provenance row per (source system, source record, entity type) so re-running an import
-- never duplicates provenance.
create unique index if not exists source_records_source_key
  on public.source_records (source_system, source_id, entity_type);

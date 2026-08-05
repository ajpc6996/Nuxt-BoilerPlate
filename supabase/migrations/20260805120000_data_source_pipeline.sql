-- Pipeline graph on data sources (Retrieve → Filter → … → Ingest)

alter table public.data_sources
  add column if not exists pipeline jsonb not null default '{}'::jsonb;

comment on column public.data_sources.pipeline is
  'Vue Flow graph: nodes/edges for Retrieve, Filter, Ingest operators';

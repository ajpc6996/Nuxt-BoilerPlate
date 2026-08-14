-- Connections are inbound (retrieve/ingest) or outbound (export from Temp Stage).
alter table public.connections
  add column if not exists direction text not null default 'inbound';

alter table public.connections
  drop constraint if exists connections_direction_check;

alter table public.connections
  add constraint connections_direction_check
  check (direction in ('inbound', 'outbound'));

comment on column public.connections.direction is
  'inbound = used by data-flow Retrieve/Ingest; outbound = export destination from Temp Stage';

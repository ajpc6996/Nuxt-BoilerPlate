-- Migration metadata on data_sources for clearer Data Flows listing.

alter table public.data_sources
  add column if not exists is_migration boolean not null default false,
  add column if not exists migration_project_id uuid references public.migration_projects (id) on delete set null,
  add column if not exists migration_stage_id uuid references public.migration_stages (id) on delete set null,
  add column if not exists migration_name text,
  add column if not exists migration_sort_order integer,
  add column if not exists destination_label text;

create index if not exists data_sources_migration_project_id_idx
  on public.data_sources (migration_project_id, migration_sort_order);

-- Backfill migration-linked flows from stages.
update public.data_sources ds
set
  is_migration = true,
  migration_project_id = ms.migration_project_id,
  migration_stage_id = ms.id,
  migration_sort_order = ms.sort_order,
  migration_name = mp.name,
  destination_label = coalesce(
    nullif(trim(ds.destination_label), ''),
    nullif(trim(ms.entity_key), ''),
    'migration'
  )
from public.migration_stages ms
join public.migration_projects mp on mp.id = ms.migration_project_id
where ms.data_source_id = ds.id
  and ds.is_migration = false;

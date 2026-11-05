begin;

create table public.wo_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default wo_private.org_id()
    references public.wo_organizations(id),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null default '',
  needs text not null default '',
  coordinator_id uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (coordinator_id, organization_id)
    references public.wo_profiles(id, organization_id)
);

create unique index wo_client_email_unique
on public.wo_clients (organization_id, lower(email));

create index wo_client_coordinator
on public.wo_clients (coordinator_id);

alter table public.wo_clients enable row level security;

revoke all on public.wo_clients
from public, anon, authenticated;

commit;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'wo_clients'
order by ordinal_position;
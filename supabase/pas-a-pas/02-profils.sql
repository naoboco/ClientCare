begin;

create table public.wo_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.wo_organizations(id),
  role text not null default 'client'
    check (role in ('client', 'coordinator', 'admin')),
  full_name text not null,
  email text not null,
  unique (id, organization_id)
);

alter table public.wo_profiles enable row level security;

revoke all on public.wo_profiles
from public, anon, authenticated;

grant select on public.wo_profiles to authenticated;

create policy profiles_read
on public.wo_profiles
for select to authenticated
using (id = (select auth.uid()));

commit;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wo_profiles'
order by ordinal_position;
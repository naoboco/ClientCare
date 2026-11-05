begin;

create table public.wo_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  daily_ai_limit integer not null default 100
    check (daily_ai_limit between 0 and 10000)
);

alter table public.wo_organizations enable row level security;

revoke all on public.wo_organizations
from public, anon, authenticated;

grant select (id, slug, name)
on public.wo_organizations to anon, authenticated;

create policy org_catalog_read
on public.wo_organizations
for select to anon, authenticated
using (slug = 'olimline');

insert into public.wo_organizations (slug, name)
values ('olimline', 'Olimline');

commit;

select id, slug, name
from public.wo_organizations
where slug = 'olimline';
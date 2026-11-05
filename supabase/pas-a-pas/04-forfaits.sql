begin;

create table public.wo_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default wo_private.org_id()
    references public.wo_organizations(id),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  data_gb integer not null check (data_gb > 0),
  national_minutes integer not null check (national_minutes >= 0),
  international_minutes integer not null check (international_minutes >= 0),
  active boolean not null default true,
  unique (id, organization_id),
  unique (organization_id, name)
);

alter table public.wo_plans enable row level security;

revoke all on public.wo_plans from public, anon, authenticated;
grant select on public.wo_plans to anon, authenticated;

grant insert (name, price, data_gb, national_minutes, international_minutes)
on public.wo_plans to authenticated;

grant update (name, price, data_gb, national_minutes, international_minutes, active)
on public.wo_plans to authenticated;

create policy plans_public on public.wo_plans
for select to anon
using (
  active and organization_id in (
    select id from public.wo_organizations where slug = 'olimline'
  )
);

create policy plans_read on public.wo_plans
for select to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (active or (select wo_private.actor_role()) = 'admin')
);

create policy plans_insert on public.wo_plans
for insert to authenticated
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
);

create policy plans_update on public.wo_plans
for update to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
)
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
);

insert into public.wo_plans (
  organization_id, name, price, data_gb,
  national_minutes, international_minutes
)
select o.id, p.*
from public.wo_organizations o
cross join (values
  ('Essentiel', 39, 50, 500, 30),
  ('Plus', 59, 150, 1500, 120),
  ('Monde', 89, 300, 3000, 300)
) p(name, price, data_gb, national_minutes, international_minutes)
where o.slug = 'olimline';

commit;

select name, price, data_gb, national_minutes, international_minutes
from public.wo_plans
where organization_id = (
  select id from public.wo_organizations where slug = 'olimline'
)
order by price;
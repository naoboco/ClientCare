begin;

create table public.wo_client_subscriptions (
  client_id uuid primary key,
  organization_id uuid not null default wo_private.org_id(),
  plan_id uuid,
  required_data_gb integer check (required_data_gb >= 0),
  required_france_minutes integer check (required_france_minutes >= 0),
  monthly_budget numeric(10,2) check (monthly_budget between 0 and 99999999.99),
  foreign key (client_id, organization_id)
    references public.wo_clients(id, organization_id) on delete cascade,
  foreign key (plan_id, organization_id)
    references public.wo_plans(id, organization_id)
);

create index wo_client_subscriptions_catalogue
  on public.wo_client_subscriptions (organization_id, plan_id);

alter table public.wo_client_subscriptions enable row level security;
revoke all on public.wo_client_subscriptions from public, anon, authenticated;

grant select on public.wo_client_subscriptions to authenticated;
grant insert (client_id, plan_id, required_data_gb, required_france_minutes, monthly_budget),
  update (plan_id, required_data_gb, required_france_minutes, monthly_budget)
on public.wo_client_subscriptions to authenticated;

create policy wo_staff_subscriptions on public.wo_client_subscriptions for all to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) in ('admin', 'coordinator')
  and wo_private.can_access_client(client_id)
)
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) in ('admin', 'coordinator')
  and wo_private.can_access_client(client_id)
  and exists (
    select 1 from public.wo_clients c
    where c.id = wo_client_subscriptions.client_id and c.archived_at is null
  )
  and (plan_id is null or exists (
    select 1 from public.wo_plans p
    where p.id = wo_client_subscriptions.plan_id and p.active
  ))
);

create function public.wo_save_client_subscription(
  p_client_id uuid,
  p_plan_id uuid,
  p_data_gb integer,
  p_france_minutes integer,
  p_monthly_budget numeric
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.wo_client_subscriptions (
    client_id, plan_id, required_data_gb, required_france_minutes, monthly_budget
  )
  values (p_client_id, p_plan_id, p_data_gb, p_france_minutes, p_monthly_budget)
  on conflict (client_id) do update set
    plan_id = excluded.plan_id,
    required_data_gb = excluded.required_data_gb,
    required_france_minutes = excluded.required_france_minutes,
    monthly_budget = excluded.monthly_budget;
$$;

revoke all on function public.wo_save_client_subscription(uuid, uuid, integer, integer, numeric)
from public, anon, authenticated;
grant execute on function public.wo_save_client_subscription(uuid, uuid, integer, integer, numeric)
to authenticated;

notify pgrst, 'reload schema';
commit;

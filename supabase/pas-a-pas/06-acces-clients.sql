begin;

grant select on public.wo_clients to authenticated;

grant update (full_name, phone, needs, coordinator_id)
on public.wo_clients to authenticated;

create function wo_private.can_access_client(client_uuid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wo_clients c
    join public.wo_profiles p
      on p.id = (select auth.uid())
      and p.organization_id = c.organization_id
    where c.id = client_uuid and (
      p.role = 'admin'
      or (p.role = 'coordinator' and c.coordinator_id = p.id)
      or (p.role = 'client' and c.user_id = p.id)
    )
  );
$$;

revoke all on function wo_private.can_access_client(uuid)
from public, anon, authenticated;

grant execute on function wo_private.can_access_client(uuid)
to authenticated;

create policy clients_read on public.wo_clients
for select to authenticated
using (wo_private.can_access_client(id));

create policy clients_update on public.wo_clients
for update to authenticated
using (
  wo_private.can_access_client(id)
  and (select wo_private.actor_role()) in ('admin', 'coordinator')
)
with check (
  organization_id = (select wo_private.org_id())
  and (
    (select wo_private.actor_role()) = 'admin'
    or (
      (select wo_private.actor_role()) = 'coordinator'
      and coordinator_id = (select auth.uid())
    )
  )
);

create function wo_private.validate_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.coordinator_id is not null and not exists (
    select 1 from public.wo_profiles
    where id = new.coordinator_id
      and organization_id = new.organization_id
      and role in ('coordinator', 'admin')
  ) then
    raise exception 'Le responsable doit être un salarié de cette organisation.';
  end if;
  return new;
end;
$$;

create trigger wo_validate_assignment
before insert or update of coordinator_id on public.wo_clients
for each row execute function wo_private.validate_assignment();

revoke all on function wo_private.validate_assignment()
from public, anon, authenticated;

commit;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'wo_clients';
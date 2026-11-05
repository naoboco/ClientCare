begin;

create schema if not exists wo_private;

revoke all on schema wo_private
from public, anon, authenticated;

grant usage on schema wo_private to authenticated;

create function wo_private.org_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select organization_id
  from public.wo_profiles
  where id = (select auth.uid());
$$;

create function wo_private.actor_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role
  from public.wo_profiles
  where id = (select auth.uid());
$$;

revoke all on function wo_private.org_id(), wo_private.actor_role()
from public, anon, authenticated;

grant execute on function wo_private.org_id(), wo_private.actor_role()
to authenticated;

alter policy profiles_read
on public.wo_profiles
using (
  id = (select auth.uid())
  or (
    organization_id = (select wo_private.org_id())
    and (select wo_private.actor_role()) = 'admin'
  )
);

commit;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'wo_profiles';
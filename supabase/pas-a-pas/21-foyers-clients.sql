begin;

-- La fiche représente le foyer, et son client est le titulaire.
create table public.wo_client_household_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wo_clients(id) on delete cascade,
  display_name text not null check (
    display_name = btrim(display_name) and char_length(display_name) between 1 and 120
  ),
  relationship text not null check (relationship in ('partner', 'child')),
  include_in_plan boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index wo_household_member_name
  on public.wo_client_household_members (client_id, lower(display_name), relationship);

alter table public.wo_client_household_members enable row level security;
revoke all on public.wo_client_household_members from public, anon, authenticated;
grant select, delete on public.wo_client_household_members to authenticated;
grant insert (client_id, display_name, relationship, include_in_plan),
  update (include_in_plan) on public.wo_client_household_members to authenticated;

create policy wo_household_read on public.wo_client_household_members for select to authenticated
using (client_id = (select wo_private.portal_client_id()) or wo_private.portal_staff(client_id, false));

create policy wo_household_add on public.wo_client_household_members for insert to authenticated
with check (client_id = (select wo_private.portal_client_id()));

create policy wo_household_update on public.wo_client_household_members for update to authenticated
using (client_id = (select wo_private.portal_client_id()))
with check (client_id = (select wo_private.portal_client_id()));

create policy wo_household_remove on public.wo_client_household_members for delete to authenticated
using (client_id = (select wo_private.portal_client_id()));

-- Le passage en traitement conserve la sélection des proches pour ce forfait.
-- Une modification ultérieure du foyer concerne la préparation suivante.
alter table public.wo_client_journeys add column plan_members jsonb
  check (plan_members is null or jsonb_typeof(plan_members) = 'array');

create function wo_private.capture_plan_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage = 'collecting' then
    new.plan_members := null;
  elsif new.stage = 'processing' or (new.stage = 'delivered' and old.plan_members is null) then
    select coalesce(jsonb_agg(
      jsonb_build_object('id', m.id, 'display_name', m.display_name, 'relationship', m.relationship)
      order by m.created_at, m.id
    ), '[]'::jsonb)
    into new.plan_members
    from public.wo_client_household_members m
    where m.client_id = new.client_id and m.include_in_plan;
  end if;
  return new;
end;
$$;

revoke all on function wo_private.capture_plan_members() from public, anon, authenticated;

create trigger wo_journey_plan_members before update of stage on public.wo_client_journeys
for each row when (old.stage is distinct from new.stage)
execute function wo_private.capture_plan_members();

notify pgrst, 'reload schema';
commit;

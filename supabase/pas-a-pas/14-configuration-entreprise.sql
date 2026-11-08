begin;

create table if not exists public.wo_workspace_settings (
  organization_id uuid primary key references public.wo_organizations(id) on delete cascade,
  communication_ai text not null default ''
    check (communication_ai in ('', 'gemini', 'claude', 'openai')),
  analysis_ai text not null default ''
    check (analysis_ai in ('', 'gemini', 'claude', 'openai')),
  gmail_address varchar(254) not null default '',
  outlook_address varchar(254) not null default '',
  whatsapp_number varchar(60) not null default '',
  business_activity varchar(120) not null default '',
  analysis_goals varchar(1500) not null default ''
);

alter table public.wo_workspace_settings enable row level security;
revoke all on public.wo_workspace_settings from public, anon, authenticated;
grant select, insert, update on public.wo_workspace_settings to authenticated;

drop policy if exists workspace_settings_admin on public.wo_workspace_settings;
create policy workspace_settings_admin on public.wo_workspace_settings
for all to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
)
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
);

grant insert (organization_id, full_name, email, phone, needs)
on public.wo_clients to authenticated;

drop policy if exists clients_admin_insert on public.wo_clients;
create policy clients_admin_insert on public.wo_clients
for insert to authenticated
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
  and char_length(btrim(full_name)) between 1 and 160
  and char_length(email) <= 254
  and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  and char_length(phone) <= 60
  and char_length(needs) <= 2000
);

create or replace function public.wo_import_clients(p_clients jsonb)
returns integer
language plpgsql security invoker
set search_path = ''
as $$
declare
  actor_org uuid := wo_private.org_id();
  imported_count integer;
begin
  if actor_org is null or wo_private.actor_role() is distinct from 'admin' then
    raise exception 'L’import est réservé à l’administration.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_clients) is distinct from 'array' then
    raise exception 'Une liste de clients est requise.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_clients) not between 1 and 500 then
    raise exception 'Importez de 1 à 500 fiches à la fois.' using errcode = '22023';
  end if;

  insert into public.wo_clients (organization_id, full_name, email, phone, needs)
  select actor_org, btrim(full_name), lower(btrim(email)),
    coalesce(btrim(phone), ''), coalesce(btrim(needs), '')
  from jsonb_to_recordset(p_clients)
    as row_data(full_name text, email text, phone text, needs text)
  on conflict do nothing;

  get diagnostics imported_count = row_count;
  return imported_count;
end;
$$;

revoke all on function public.wo_import_clients(jsonb) from public, anon, authenticated;
grant execute on function public.wo_import_clients(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

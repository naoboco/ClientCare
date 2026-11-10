begin;

-- Une date vide indique une fiche active. Les données restent sur la même ligne.
alter table public.wo_clients
  add column if not exists archived_at timestamptz;

create or replace function wo_private.create_client(
  p_full_name text,
  p_email text,
  p_phone text,
  p_needs text
)
returns setof public.wo_clients
language plpgsql security definer set search_path = ''
as $$
declare
  member record;
  client_name text := btrim(coalesce(p_full_name, ''));
  client_email text := lower(btrim(coalesce(p_email, '')));
  client_phone text := btrim(coalesce(p_phone, ''));
  client_needs text := btrim(coalesce(p_needs, ''));
begin
  select p.id, p.organization_id, p.role into member
  from public.wo_profiles p
  where p.id = (select auth.uid());

  if not found or member.role not in ('admin', 'coordinator') then
    raise exception 'La création de fiches est réservée à l’équipe.' using errcode = '42501';
  end if;

  if char_length(client_name) not between 1 and 160 then
    raise exception 'Renseignez un nom de 1 à 160 caractères.' using errcode = '22023';
  end if;
  if char_length(client_email) > 254
    or client_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Renseignez une adresse e-mail valide.' using errcode = '22023';
  end if;
  if char_length(client_phone) > 60 or char_length(client_needs) > 6000 then
    raise exception 'Le téléphone ou les notes dépassent la longueur autorisée.' using errcode = '22023';
  end if;

  -- L’organisation et le responsable proviennent de la session.
  return query
    insert into public.wo_clients (organization_id, coordinator_id, full_name, email, phone, needs)
    values (
      member.organization_id,
      case when member.role = 'coordinator' then member.id end,
      client_name, client_email, client_phone, client_needs
    )
    returning *;
end;
$$;

create or replace function wo_private.set_client_archive(p_client_id uuid, p_archived boolean)
returns setof public.wo_clients
language plpgsql security definer set search_path = ''
as $$
declare
  member record;
begin
  select p.id, p.organization_id, p.role into member
  from public.wo_profiles p
  where p.id = (select auth.uid());

  if not found or member.role not in ('admin', 'coordinator') then
    raise exception 'La gestion des archives est réservée à l’équipe.' using errcode = '42501';
  end if;
  if p_archived is null then
    raise exception 'Indiquez le nouvel état de la fiche.' using errcode = '22023';
  end if;

  return query
    update public.wo_clients c
    set archived_at = case when p_archived then coalesce(c.archived_at, now()) else null end
    where c.id = p_client_id and c.organization_id = member.organization_id
      and (member.role = 'admin' or c.coordinator_id = member.id)
    returning c.*;

  if not found then
    raise exception 'Cette fiche n’est pas accessible.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.wo_create_client(
  p_full_name text, p_email text, p_phone text, p_needs text
)
returns setof public.wo_clients
language sql security invoker set search_path = ''
as $$ select * from wo_private.create_client(p_full_name, p_email, p_phone, p_needs); $$;

create or replace function public.wo_set_client_archive(p_client_id uuid, p_archived boolean)
returns setof public.wo_clients
language sql security invoker set search_path = ''
as $$ select * from wo_private.set_client_archive(p_client_id, p_archived); $$;

revoke all on function
  wo_private.create_client(text, text, text, text),
  wo_private.set_client_archive(uuid, boolean),
  public.wo_create_client(text, text, text, text),
  public.wo_set_client_archive(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  wo_private.create_client(text, text, text, text),
  wo_private.set_client_archive(uuid, boolean),
  public.wo_create_client(text, text, text, text),
  public.wo_set_client_archive(uuid, boolean)
to authenticated;

notify pgrst, 'reload schema';
commit;

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists wo_private.staff_invitation_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null check (octet_length(secret) = 32)
);

revoke all on wo_private.staff_invitation_key from public, anon, authenticated;

do $setup$
declare
  crypto_schema text;
begin
  select n.nspname into strict crypto_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  execute format(
    'insert into wo_private.staff_invitation_key (secret)
     values (%I.gen_random_bytes(32)) on conflict do nothing',
    crypto_schema
  );

  execute format($function$
    create or replace function wo_private.sign_staff_invitation(invitation_id uuid)
    returns bytea
    language sql stable security invoker set search_path = ''
    as $body$
      select %I.hmac(convert_to(invitation_id::text, 'UTF8'), secret, 'sha256')
      from wo_private.staff_invitation_key where singleton;
    $body$;
  $function$, crypto_schema);
end;
$setup$;

revoke all on function wo_private.sign_staff_invitation(uuid) from public, anon, authenticated;

create table if not exists public.wo_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wo_organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'coordinator')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create index if not exists wo_staff_invitation_org_date
on public.wo_staff_invitations (organization_id, created_at desc);

alter table public.wo_staff_invitations enable row level security;
revoke all on public.wo_staff_invitations from public, anon, authenticated;
grant select on public.wo_staff_invitations to authenticated;
grant update (revoked_at) on public.wo_staff_invitations to authenticated;

drop policy if exists staff_invitation_admin_read on public.wo_staff_invitations;
create policy staff_invitation_admin_read on public.wo_staff_invitations
for select to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
);

drop policy if exists staff_invitation_admin_revoke on public.wo_staff_invitations;
create policy staff_invitation_admin_revoke on public.wo_staff_invitations
for update to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
  and accepted_at is null and revoked_at is null and expires_at > now()
)
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
  and accepted_at is null and revoked_at is not null
);

create or replace function wo_private.create_staff_invitation(p_email text, p_role text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_org uuid := wo_private.org_id();
  recipient_email text := lower(btrim(coalesce(p_email, '')));
  invitation public.wo_staff_invitations;
begin
  if actor_id is null or actor_org is null or wo_private.actor_role() is distinct from 'admin' then
    raise exception 'La création d’invitations est réservée à l’administration.' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('admin', 'coordinator')
    or char_length(recipient_email) > 254
    or recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Renseignez une adresse e-mail et un rôle valides.' using errcode = '22023';
  end if;

  insert into public.wo_staff_invitations (organization_id, email, role, created_by)
  values (actor_org, recipient_email, p_role, actor_id)
  returning * into invitation;

  return jsonb_build_object(
    'token', invitation.id::text || '.' || encode(wo_private.sign_staff_invitation(invitation.id), 'hex'),
    'expires_at', invitation.expires_at
  );
end;
$$;

create or replace function wo_private.accept_staff_invitation(p_token text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
  member_email text;
  member_name text;
  invitation public.wo_staff_invitations;
  assigned_role text;
begin
  select lower(email), left(coalesce(nullif(btrim(raw_user_meta_data ->> 'full_name'), ''), split_part(email, '@', 1)), 160)
  into member_email, member_name
  from auth.users where id = member_id and email_confirmed_at is not null;

  if member_email is null then
    raise exception 'Connectez-vous avec votre adresse e-mail confirmée.' using errcode = '42501';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$' then
    raise exception 'Ce lien d’invitation est invalide ou a expiré.' using errcode = '22023';
  end if;

  select * into invitation from public.wo_staff_invitations
  where id = split_part(p_token, '.', 1)::uuid and email = member_email
  for update;

  if not found or invitation.revoked_at is not null or invitation.accepted_at is not null
    or invitation.expires_at <= clock_timestamp()
    or sha256(decode(split_part(p_token, '.', 2), 'hex'))
      is distinct from sha256(wo_private.sign_staff_invitation(invitation.id)) then
    raise exception 'Ce lien d’invitation est invalide, expiré ou lié à une autre adresse.' using errcode = '22023';
  end if;

  insert into public.wo_profiles as profile (id, organization_id, full_name, email, role)
  values (member_id, invitation.organization_id, member_name, member_email, invitation.role)
  on conflict (id) do update set role = excluded.role, email = excluded.email
  where profile.organization_id = excluded.organization_id
    and (profile.role <> 'admin' or excluded.role = 'admin')
  returning role into assigned_role;

  if assigned_role is null then
    raise exception 'Ce compte est déjà rattaché à un espace incompatible avec l’invitation.' using errcode = '42501';
  end if;

  update public.wo_staff_invitations
  set accepted_at = clock_timestamp(), accepted_by = member_id
  where id = invitation.id;

  return assigned_role;
end;
$$;

create or replace function public.wo_create_staff_invitation(p_email text, p_role text)
returns jsonb language sql security invoker set search_path = ''
as $$ select wo_private.create_staff_invitation(p_email, p_role); $$;

create or replace function public.wo_accept_staff_invitation(p_token text)
returns text language sql security invoker set search_path = ''
as $$ select wo_private.accept_staff_invitation(p_token); $$;

revoke all on function wo_private.create_staff_invitation(text, text), wo_private.accept_staff_invitation(text),
  public.wo_create_staff_invitation(text, text), public.wo_accept_staff_invitation(text)
from public, anon, authenticated;
grant execute on function wo_private.create_staff_invitation(text, text), wo_private.accept_staff_invitation(text),
  public.wo_create_staff_invitation(text, text), public.wo_accept_staff_invitation(text)
to authenticated;

create or replace function wo_private.bootstrap_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  org uuid;
  display_name text;
begin
  -- L’intention d’inscription évite de créer une fiche client pour un invité.
  -- Le rôle est attribué exclusivement lors de l’acceptation de l’invitation.
  if new.email is null or new.raw_user_meta_data ->> 'watchover_access' = 'staff_invite' then
    return new;
  end if;

  select id into org
  from public.wo_organizations where slug = 'olimline';

  if org is null then
    raise exception 'Entreprise Olimline introuvable.';
  end if;

  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.wo_profiles (id, organization_id, full_name, email)
  values (new.id, org, display_name, lower(new.email))
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null
    and lower(new.email) not in (
      'naomiebocobza@naobocolab.com', 'naomiebocobza@gmail.com'
    )
    and exists (
      select 1 from public.wo_profiles p
      where p.id = new.id and p.organization_id = org and p.role = 'client'
    )
  then
    insert into public.wo_clients as contact (
      organization_id, user_id, full_name, email
    )
    values (org, new.id, display_name, lower(new.email))
    on conflict (organization_id, lower(email)) do update
      set user_id = excluded.user_id
      where contact.user_id is null;
  end if;

  return new;
end;
$$;

revoke all on function wo_private.bootstrap_user() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

begin;

create function wo_private.bootstrap_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  org uuid;
  display_name text;
begin
  if new.email is null then
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

revoke all on function wo_private.bootstrap_user()
from public, anon, authenticated;

create trigger wo_user_created
after insert or update of email_confirmed_at on auth.users
for each row execute function wo_private.bootstrap_user();

commit;

select distinct trigger_name, event_object_schema, event_object_table
from information_schema.triggers
where trigger_name = 'wo_user_created'
  and event_object_schema = 'auth'
  and event_object_table = 'users';
begin;

do $$
declare
  company uuid;
  coordinator_profile uuid;
begin
  select id into company
  from public.wo_organizations
  where slug = 'olimline';

  coordinator_profile := (
    select p.id
    from public.wo_profiles p
    join auth.users u on u.id = p.id
    where p.organization_id = company
      and p.role = 'coordinator'
      and lower(u.email) = 'naomiebocobza@gmail.com'
      and u.email_confirmed_at is not null
  );

  if coordinator_profile is null then
    raise exception 'Coordinateur confirmé avec le rôle coordinator introuvable dans Olimline.';
  end if;

  update public.wo_clients
  set coordinator_id = coordinator_profile
  where organization_id = company
    and coordinator_id is null
    and lower(email) in (
      'dododino20@gmail.com',
      'naobocolab@gmail.com',
      'raphaelsadnaot@gmail.com',
      'd34119167@gmail.com',
      'dododinoannna@gmail.com'
    );
end;
$$;

commit;

select
  c.full_name,
  coalesce(p.email, 'À attribuer') as coordinateur
from public.wo_clients c
join public.wo_organizations o
  on o.id = c.organization_id
left join public.wo_profiles p
  on p.id = c.coordinator_id
where o.slug = 'olimline'
order by c.full_name;
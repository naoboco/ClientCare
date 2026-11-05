update public.wo_profiles as p
set role = 'admin',
    full_name = 'Naomie Bocobza'
from auth.users as u
where p.id = u.id
  and lower(u.email) = 'naomiebocobza@naobocolab.com'
  and u.email_confirmed_at is not null
  and p.organization_id = (
    select id from public.wo_organizations where slug = 'olimline'
  )
returning p.full_name, p.email, p.role;
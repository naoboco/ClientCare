begin;

insert into public.wo_clients (
  organization_id, full_name, email, needs
)
select o.id, c.*
from public.wo_organizations o
cross join (values
  ('Myriam Bocobza', 'naomiebocobzapro@gmail.com', 'Usage modéré, priorité au budget.'),
  ('dododino', 'dododino20@gmail.com', 'Internet quotidien et appels vers la France.'),
  ('Naomie Bocobza', 'naobocolab@gmail.com', 'Dossier à compléter avec un document de test.'),
  ('Raphael Sadnaot', 'raphaelsadnaot@gmail.com', 'Appels internationaux ; problème à examiner.'),
  ('dominique', 'd34119167@gmail.com', 'Ancien client ; vérifier ses besoins avant une relance.'),
  ('annna dododino', 'dododinoannna@gmail.com', 'Hésite entre Plus et Monde ; préciser les minutes nécessaires.')
) c(full_name, email, needs)
where o.slug = 'olimline';

commit;

select full_name, email, needs
from public.wo_clients
where organization_id = (
  select id from public.wo_organizations where slug = 'olimline'
)
order by full_name;
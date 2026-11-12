begin;

-- À appliquer à la bascule du portail. La nouvelle interface client lit les
-- coordonnées et le responsable via wo_portal_contact.
alter policy clients_read on public.wo_clients
using (
  wo_private.can_access_client(id)
  and (select wo_private.actor_role()) in ('admin', 'coordinator')
);

commit;

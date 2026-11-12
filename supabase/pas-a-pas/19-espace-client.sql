begin;

alter table public.wo_clients add column portal_contact_confirmed_at timestamptz;

-- Les notes de la fiche CRM restent accessibles à l’équipe. Le portail lit
-- uniquement les coordonnées et le nom du responsable via wo_portal_contact.
alter policy clients_read on public.wo_clients
using (
  wo_private.can_access_client(id)
  and (select wo_private.actor_role()) in ('admin', 'coordinator')
);

create table public.wo_client_journeys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wo_clients(id) on delete cascade,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 160),
  stage text not null default 'collecting' check (stage in ('collecting', 'processing', 'delivered')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  check ((stage = 'delivered') = (delivered_at is not null))
);

create unique index wo_one_open_client_journey
  on public.wo_client_journeys (client_id) where stage <> 'delivered';
create index wo_client_journey_history on public.wo_client_journeys (client_id, created_at desc);

create table public.wo_client_documents (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.wo_client_journeys(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  status text not null default 'missing' check (status in ('missing', 'submitted', 'approved', 'rejected')),
  upload_id uuid not null default gen_random_uuid(),
  storage_path text generated always as (id::text || '/' || upload_id::text) stored unique,
  file_name text,
  review_note text not null default '' check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  check ((status in ('submitted', 'approved')) = (file_name is not null))
);

create unique index wo_journey_document_label on public.wo_client_documents (journey_id, lower(label));

create table public.wo_client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wo_clients(id) on delete cascade,
  kind text not null check (kind in ('new_product', 'technical_issue')),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 3000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  reply text not null default '' check (char_length(reply) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wo_client_request_history on public.wo_client_requests (client_id, created_at desc);

alter table public.wo_client_journeys enable row level security;
alter table public.wo_client_documents enable row level security;
alter table public.wo_client_requests enable row level security;

revoke all on public.wo_client_journeys, public.wo_client_documents, public.wo_client_requests
from public, anon, authenticated;

grant select on public.wo_client_journeys, public.wo_client_documents, public.wo_client_requests
to authenticated;
grant insert (id, client_id, kind, product_name, description)
on public.wo_client_requests to authenticated;
grant update (status, reply) on public.wo_client_requests to authenticated;

create function wo_private.portal_client_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.id
  from public.wo_clients c
  join public.wo_profiles p on p.id = c.user_id and p.organization_id = c.organization_id
  join auth.users u on u.id = p.id
  where c.user_id = (select auth.uid())
    and p.role = 'client' and c.archived_at is null
    and u.email_confirmed_at is not null and lower(u.email) = lower(c.email);
$$;

create function wo_private.portal_staff(p_client_id uuid, p_active_only boolean)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.wo_clients c
    join public.wo_profiles p
      on p.id = (select auth.uid()) and p.organization_id = c.organization_id
    where c.id = p_client_id and (not p_active_only or c.archived_at is null)
      and (p.role = 'admin' or (p.role = 'coordinator' and c.coordinator_id = p.id))
  );
$$;

create policy wo_journeys_read on public.wo_client_journeys for select to authenticated
using (client_id = (select wo_private.portal_client_id()) or wo_private.portal_staff(client_id, false));

create policy wo_documents_read on public.wo_client_documents for select to authenticated
using (exists (select 1 from public.wo_client_journeys j where j.id = journey_id));

create policy wo_requests_read on public.wo_client_requests for select to authenticated
using (client_id = (select wo_private.portal_client_id()) or wo_private.portal_staff(client_id, false));

create policy wo_requests_create on public.wo_client_requests for insert to authenticated
with check (client_id = (select wo_private.portal_client_id()));

create policy wo_requests_update on public.wo_client_requests for update to authenticated
using (wo_private.portal_staff(client_id, true))
with check (wo_private.portal_staff(client_id, true));

create function wo_private.touch_client_request()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger wo_client_request_updated before update on public.wo_client_requests
for each row execute function wo_private.touch_client_request();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wo-client-documents', 'wo-client-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png']);

-- Une clé d’objet est réservée par pièce et par tentative. Les téléversements
-- n’ont aucun droit d’écrasement. Un refus réserve une nouvelle clé.
create function wo_private.can_upload_portal_file(p_path text)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.wo_client_documents d
    join public.wo_client_journeys j on j.id = d.journey_id
    where d.storage_path = p_path and d.status in ('missing', 'rejected')
      and j.stage = 'collecting' and j.client_id = (select wo_private.portal_client_id())
  );
$$;

create function wo_private.can_read_portal_file(p_path text)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.wo_client_documents d
    where d.storage_path = p_path and d.status in ('submitted', 'approved')
  );
$$;

create policy wo_portal_file_insert on storage.objects for insert to authenticated
with check (bucket_id = 'wo-client-documents' and wo_private.can_upload_portal_file(name));
create policy wo_portal_file_read on storage.objects for select to authenticated
using (bucket_id = 'wo-client-documents' and wo_private.can_read_portal_file(name));

-- Une politique générale déjà présente sur Storage ne doit pas ouvrir ce bucket.
create policy wo_portal_file_insert_scope on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'wo-client-documents' or wo_private.can_upload_portal_file(name));
create policy wo_portal_file_read_scope on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'wo-client-documents' or wo_private.can_read_portal_file(name));
create policy wo_portal_file_no_update on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'wo-client-documents') with check (bucket_id <> 'wo-client-documents');
create policy wo_portal_file_no_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'wo-client-documents');
create policy wo_portal_file_no_anonymous on storage.objects as restrictive for all to anon
using (bucket_id <> 'wo-client-documents') with check (bucket_id <> 'wo-client-documents');

create function wo_private.portal_contact()
returns table (
  id uuid, full_name text, email text, phone text, contact_confirmed boolean, coordinator_name text
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.full_name, c.email, c.phone,
    c.portal_contact_confirmed_at is not null and btrim(c.phone) <> '',
    p.full_name
  from public.wo_clients c
  left join public.wo_profiles p on p.id = c.coordinator_id and p.organization_id = c.organization_id
  where c.id = (select wo_private.portal_client_id());
$$;

-- Les opérations du parcours prennent le même verrou sur la fiche. Une
-- livraison ne peut donc pas être validée pendant une modification des pièces.
create function wo_private.lock_portal_client(p_client_id uuid, p_staff boolean)
returns void language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.wo_clients c
  where c.id = p_client_id and c.archived_at is null
    and (
      (p_staff and wo_private.portal_staff(c.id, true))
      or (not p_staff and c.id = (select wo_private.portal_client_id()))
    )
  for update;

  if not found or (
    case when p_staff then wo_private.portal_staff(p_client_id, true)
    else p_client_id = wo_private.portal_client_id() end
  ) is not true then
    raise exception 'Ce dossier n’est pas accessible.' using errcode = '42501';
  end if;
end;
$$;

create function wo_private.lock_portal_journey(p_journey_id uuid, p_staff boolean)
returns public.wo_client_journeys language plpgsql set search_path = ''
as $$
declare
  journey public.wo_client_journeys;
begin
  select * into journey from public.wo_client_journeys where id = p_journey_id;
  perform wo_private.lock_portal_client(journey.client_id, p_staff);
  select * into strict journey from public.wo_client_journeys where id = p_journey_id;
  return journey;
end;
$$;

create function wo_private.save_portal_contact(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  client_id uuid := wo_private.portal_client_id();
  client_name text := btrim(coalesce(p_full_name, ''));
  client_phone text := btrim(coalesce(p_phone, ''));
begin
  perform wo_private.lock_portal_client(client_id, false);
  if char_length(client_name) not between 1 and 160 or char_length(client_phone) not between 1 and 60 then
    raise exception 'Renseignez votre nom complet et votre numéro de téléphone.' using errcode = '22023';
  end if;

  update public.wo_clients
  set full_name = client_name, phone = client_phone, portal_contact_confirmed_at = now()
  where id = client_id;
end;
$$;

create function wo_private.start_client_journey(p_client_id uuid, p_product_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  product text := btrim(coalesce(p_product_name, ''));
begin
  perform wo_private.lock_portal_client(p_client_id, true);
  if char_length(product) not between 1 and 160 then
    raise exception 'Renseignez le nom du produit.' using errcode = '22023';
  end if;
  if exists (select 1 from public.wo_client_journeys where client_id = p_client_id and stage <> 'delivered') then
    raise exception 'Un suivi est déjà en cours pour ce client.' using errcode = '22023';
  end if;

  insert into public.wo_client_journeys (client_id, product_name) values (p_client_id, product);
end;
$$;

create function wo_private.set_client_journey_stage(p_journey_id uuid, p_stage text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  journey public.wo_client_journeys := wo_private.lock_portal_journey(p_journey_id, true);
begin
  if journey.stage = p_stage then return; end if;

  if not (
    (journey.stage = 'collecting' and p_stage = 'processing')
    or (journey.stage = 'processing' and p_stage in ('collecting', 'delivered'))
  ) or p_stage is null then
    raise exception 'Cette étape n’est pas disponible.' using errcode = '22023';
  end if;

  if p_stage in ('processing', 'delivered') and (
    not exists (
      select 1 from public.wo_clients c where c.id = journey.client_id
        and c.portal_contact_confirmed_at is not null and btrim(c.phone) <> ''
    )
    or exists (
      select 1 from public.wo_client_documents d where d.journey_id = journey.id and d.status <> 'approved'
    )
  ) then
    raise exception 'Les coordonnées et toutes les pièces demandées doivent être validées.' using errcode = '22023';
  end if;

  update public.wo_client_journeys
  set stage = p_stage, delivered_at = case when p_stage = 'delivered' then now() end
  where id = journey.id;
end;
$$;

create function wo_private.add_client_document(p_journey_id uuid, p_label text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  journey public.wo_client_journeys := wo_private.lock_portal_journey(p_journey_id, true);
  document_label text := btrim(coalesce(p_label, ''));
begin
  if journey.stage <> 'collecting' or char_length(document_label) not between 1 and 120 then
    raise exception 'Ajoutez un nom de pièce valide pendant la collecte des documents.' using errcode = '22023';
  end if;

  insert into public.wo_client_documents (journey_id, label)
  values (journey.id, document_label) on conflict (journey_id, lower(label)) do nothing;
end;
$$;

create function wo_private.portal_checklist(p_journey_id uuid)
returns table (
  id uuid, label text, status text, storage_path text, file_name text, review_note text, upload_received boolean
)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.label, d.status, d.storage_path, d.file_name, d.review_note,
    coalesce(j.client_id = (select wo_private.portal_client_id()), false) and d.status in ('missing', 'rejected')
    and exists (
      select 1 from storage.objects o where o.bucket_id = 'wo-client-documents' and o.name = d.storage_path
    )
  from public.wo_client_documents d
  join public.wo_client_journeys j on j.id = d.journey_id
  where j.id = p_journey_id and (
    j.client_id = (select wo_private.portal_client_id()) or wo_private.portal_staff(j.client_id, false)
  )
  order by d.created_at, d.id;
$$;

create function wo_private.submit_client_document(p_document_id uuid, p_storage_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  journey public.wo_client_journeys;
  document public.wo_client_documents;
  uploaded_name text;
begin
  select * into document from public.wo_client_documents where id = p_document_id;
  journey := wo_private.lock_portal_journey(document.journey_id, false);
  select * into strict document from public.wo_client_documents where id = p_document_id;

  if document.storage_path is distinct from p_storage_path then
    raise exception 'Cette pièce a changé. Actualisez la liste avant de déposer le fichier.' using errcode = '22023';
  end if;
  if document.status in ('submitted', 'approved') then return; end if;
  if journey.stage <> 'collecting' then
    raise exception 'Le dépôt de pièces est terminé pour ce suivi.' using errcode = '22023';
  end if;

  select left(coalesce(nullif(btrim(o.user_metadata ->> 'file_name'), ''), document.label), 240)
    into uploaded_name
  from storage.objects o where o.bucket_id = 'wo-client-documents' and o.name = document.storage_path;

  if not found then
    raise exception 'Le fichier n’a pas été reçu. Déposez-le à nouveau.' using errcode = '22023';
  end if;

  update public.wo_client_documents set status = 'submitted', file_name = uploaded_name, review_note = ''
  where id = document.id;
end;
$$;

create function wo_private.review_client_document(
  p_document_id uuid, p_storage_path text, p_approved boolean, p_note text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  journey public.wo_client_journeys;
  document public.wo_client_documents;
  note text := btrim(coalesce(p_note, ''));
begin
  select * into document from public.wo_client_documents where id = p_document_id;
  journey := wo_private.lock_portal_journey(document.journey_id, true);
  select * into strict document from public.wo_client_documents where id = p_document_id;

  if journey.stage <> 'collecting' or document.status <> 'submitted'
    or document.storage_path is distinct from p_storage_path then
    raise exception 'Cette pièce a changé. Actualisez la liste avant de la vérifier.' using errcode = '22023';
  end if;
  if p_approved is null or (not p_approved and char_length(note) not between 1 and 500) then
    raise exception 'Indiquez au client ce qu’il doit corriger.' using errcode = '22023';
  end if;

  update public.wo_client_documents
  set status = case when p_approved then 'approved' else 'rejected' end,
      file_name = case when p_approved then document.file_name end,
      review_note = case when p_approved then '' else note end,
      upload_id = case when p_approved then document.upload_id else gen_random_uuid() end
  where id = document.id;
end;
$$;

create function public.wo_portal_contact()
returns table (
  id uuid, full_name text, email text, phone text, contact_confirmed boolean, coordinator_name text
)
language sql stable set search_path = ''
as $$ select * from wo_private.portal_contact(); $$;

create function public.wo_portal_save_contact(p_full_name text, p_phone text)
returns void language sql set search_path = ''
as $$ select wo_private.save_portal_contact(p_full_name, p_phone); $$;

create function public.wo_portal_start_journey(p_client_id uuid, p_product_name text)
returns void language sql set search_path = ''
as $$ select wo_private.start_client_journey(p_client_id, p_product_name); $$;

create function public.wo_portal_set_stage(p_journey_id uuid, p_stage text)
returns void language sql set search_path = ''
as $$ select wo_private.set_client_journey_stage(p_journey_id, p_stage); $$;

create function public.wo_portal_add_document(p_journey_id uuid, p_label text)
returns void language sql set search_path = ''
as $$ select wo_private.add_client_document(p_journey_id, p_label); $$;

create function public.wo_portal_checklist(p_journey_id uuid)
returns table (
  id uuid, label text, status text, storage_path text, file_name text, review_note text, upload_received boolean
)
language sql stable set search_path = ''
as $$ select * from wo_private.portal_checklist(p_journey_id); $$;

create function public.wo_portal_submit_document(p_document_id uuid, p_storage_path text)
returns void language sql set search_path = ''
as $$ select wo_private.submit_client_document(p_document_id, p_storage_path); $$;

create function public.wo_portal_review_document(
  p_document_id uuid, p_storage_path text, p_approved boolean, p_note text
)
returns void language sql set search_path = ''
as $$ select wo_private.review_client_document(p_document_id, p_storage_path, p_approved, p_note); $$;

revoke all on function
  wo_private.lock_portal_client(uuid, boolean), wo_private.lock_portal_journey(uuid, boolean),
  wo_private.touch_client_request()
from public, anon, authenticated;

revoke all on function
  wo_private.portal_client_id(), wo_private.portal_staff(uuid, boolean),
  wo_private.can_upload_portal_file(text), wo_private.can_read_portal_file(text),
  wo_private.portal_contact(), wo_private.save_portal_contact(text, text),
  wo_private.start_client_journey(uuid, text), wo_private.set_client_journey_stage(uuid, text),
  wo_private.add_client_document(uuid, text), wo_private.portal_checklist(uuid),
  wo_private.submit_client_document(uuid, text), wo_private.review_client_document(uuid, text, boolean, text),
  public.wo_portal_contact(), public.wo_portal_save_contact(text, text),
  public.wo_portal_start_journey(uuid, text), public.wo_portal_set_stage(uuid, text),
  public.wo_portal_add_document(uuid, text), public.wo_portal_checklist(uuid),
  public.wo_portal_submit_document(uuid, text), public.wo_portal_review_document(uuid, text, boolean, text)
from public, anon, authenticated;

grant execute on function
  wo_private.portal_client_id(), wo_private.portal_staff(uuid, boolean),
  wo_private.can_upload_portal_file(text), wo_private.can_read_portal_file(text),
  wo_private.portal_contact(), wo_private.save_portal_contact(text, text),
  wo_private.start_client_journey(uuid, text), wo_private.set_client_journey_stage(uuid, text),
  wo_private.add_client_document(uuid, text), wo_private.portal_checklist(uuid),
  wo_private.submit_client_document(uuid, text), wo_private.review_client_document(uuid, text, boolean, text),
  public.wo_portal_contact(), public.wo_portal_save_contact(text, text),
  public.wo_portal_start_journey(uuid, text), public.wo_portal_set_stage(uuid, text),
  public.wo_portal_add_document(uuid, text), public.wo_portal_checklist(uuid),
  public.wo_portal_submit_document(uuid, text), public.wo_portal_review_document(uuid, text, boolean, text)
to authenticated;

notify pgrst, 'reload schema';
commit;

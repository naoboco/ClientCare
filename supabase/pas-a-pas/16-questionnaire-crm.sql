begin;

create or replace function wo_private.valid_crm_presence(
  channels jsonb, no_digital boolean, completed boolean
)
returns boolean
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  channel jsonb;
  kind text;
  reference text;
begin
  if jsonb_typeof(channels) is distinct from 'array' then return false; end if;
  if jsonb_array_length(channels) > 15 then return false; end if;
  if completed and jsonb_array_length(channels) = 0 and not no_digital then return false; end if;

  for channel in select value from jsonb_array_elements(channels)
  loop
    if jsonb_typeof(channel) is distinct from 'object'
      or jsonb_typeof(channel -> 'kind') is distinct from 'string'
      or jsonb_typeof(channel -> 'reference') is distinct from 'string'
      or (channel - 'kind' - 'reference') <> '{}'::jsonb then
      return false;
    end if;

    kind := channel ->> 'kind';
    reference := btrim(channel ->> 'reference');
    if kind not in ('website', 'store', 'instagram', 'facebook', 'tiktok', 'whatsapp', 'marketplace', 'app', 'physical')
      or (no_digital and kind <> 'physical')
      or char_length(channel ->> 'reference') > 300
      or octet_length(channel::text) > 1800 then
      return false;
    end if;

    if completed and (reference = '' or (
      kind in ('website', 'store') and reference !~* '^https?://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$'
    )) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function wo_private.valid_crm_presence(jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function wo_private.valid_crm_presence(jsonb, boolean, boolean) to authenticated;

create table if not exists public.wo_crm_questionnaires (
  organization_id uuid primary key references public.wo_organizations(id) on delete cascade,
  organization_name varchar(120) not null default '',
  organization_type text not null default '' check (organization_type in (
    '', 'commerce', 'association', 'services', 'formation', 'immobilier',
    'accompagnement', 'independant', 'technologie', 'autre'
  )),
  industry varchar(120) not null default '',
  description varchar(1500) not null default '',
  country varchar(80) not null default '',
  languages varchar(120) not null default '',
  audience_size integer check (audience_size between 0 and 100000000),
  goals varchar(1500) not null default '',
  operations text[] not null default '{}' check (operations <@ array[
    'contacts', 'requests', 'tasks', 'products', 'services', 'shop', 'online', 'orders', 'stock',
    'sales', 'loyalty', 'beneficiaries', 'volunteers', 'donations', 'aid', 'events', 'cases',
    'appointments', 'contracts', 'billing', 'projects', 'support', 'learners', 'courses',
    'registration', 'progress', 'properties', 'visits'
  ] and coalesce(array_ndims(operations), 1) = 1 and cardinality(operations) <= 28),
  public_presence jsonb not null default '[]',
  no_digital_presence boolean not null default false,
  team_size integer check (team_size between 0 and 10000),
  team_roles varchar(500) not null default '',
  departments varchar(300) not null default '',
  team_leads boolean not null default false,
  view_access text not null default 'assigned' check (view_access in ('assigned', 'department', 'organization')),
  edit_access text not null default 'assigned' check (edit_access in ('assigned', 'department', 'organization')),
  analysis_access text not null default 'admin' check (analysis_access in ('admin', 'supervisors', 'staff')),
  communication_channels text[] not null default '{}' check (communication_channels <@ array[
    'gmail', 'outlook', 'whatsapp', 'email', 'forms', 'phone', 'sms', 'internal'
  ] and coalesce(array_ndims(communication_channels), 1) = 1 and cardinality(communication_channels) <= 8),
  client_sources text[] not null default '{}' check (client_sources <@ array[
    'csv', 'excel', 'sheets', 'crm', 'manual'
  ] and coalesce(array_ndims(client_sources), 1) = 1 and cardinality(client_sources) <= 5),
  sales_sources text[] not null default '{}' check (sales_sources <@ array[
    'shopify', 'woocommerce', 'wix', 'stripe', 'paypal', 'analytics', 'meta', 'ads', 'pos', 'csv', 'excel', 'sheets'
  ] and coalesce(array_ndims(sales_sources), 1) = 1 and cardinality(sales_sources) <= 12),
  modules text[] not null default '{}' check (modules <@ array[
    'contacts', 'leads', 'sales', 'cases', 'agenda', 'tasks', 'forms', 'documents', 'campaigns',
    'reminders', 'workflows', 'email', 'communication', 'summaries', 'priority', 'performance',
    'team', 'clients', 'forecast', 'competitors', 'sector', 'regulation', 'research', 'reports', 'strategy'
  ] and coalesce(array_ndims(modules), 1) = 1 and cardinality(modules) <= 25),
  interface_style text not null default '' check (interface_style in ('', 'classic', 'formal', 'gaming', 'cartoon')),
  checkpoint smallint not null default 0 check (checkpoint between 0 and 8),
  revision integer not null default 1 check (revision > 0),
  ready boolean not null default false,
  check (wo_private.valid_crm_presence(public_presence, no_digital_presence, ready)),
  check (not ready or (checkpoint = 8 and btrim(organization_name) <> '' and organization_type <> '' and interface_style <> ''))
);

alter table public.wo_crm_questionnaires enable row level security;
revoke all on public.wo_crm_questionnaires from public, anon, authenticated;
grant select, insert, update on public.wo_crm_questionnaires to authenticated;

drop policy if exists crm_questionnaire_admin on public.wo_crm_questionnaires;
create policy crm_questionnaire_admin on public.wo_crm_questionnaires
for all to authenticated
using (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
)
with check (
  organization_id = (select wo_private.org_id())
  and (select wo_private.actor_role()) = 'admin'
);

notify pgrst, 'reload schema';

commit;

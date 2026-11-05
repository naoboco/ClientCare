begin;

alter table public.wo_clients
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_followup_at timestamptz;

alter table public.wo_clients enable row level security;

grant update (last_contact_at, next_followup_at)
on public.wo_clients to authenticated;

create index if not exists wo_clients_next_followup
on public.wo_clients (organization_id, next_followup_at)
where next_followup_at is not null;

notify pgrst, 'reload schema';

commit;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wo_clients'
  and column_name in ('last_contact_at', 'next_followup_at')
order by column_name;

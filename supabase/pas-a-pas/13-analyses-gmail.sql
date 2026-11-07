begin;

create table if not exists public.wo_client_email_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wo_clients(id) on delete cascade,
  reviewed_by uuid default auth.uid() references public.wo_profiles(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  message_count integer not null check (message_count > 0),
  first_message_at timestamptz,
  last_message_at timestamptz,
  summary text not null check (length(trim(summary)) between 1 and 2000),
  needs text not null check (length(trim(needs)) between 1 and 2000),
  suggested_reply text not null check (length(suggested_reply) <= 2000),
  uncertainties text[] not null default '{}' check (
    cardinality(uncertainties) <= 5 and length(array_to_string(uncertainties, '')) <= 1500
  ),
  check (first_message_at <= last_message_at)
);

alter table public.wo_client_email_analyses enable row level security;
revoke all on table public.wo_client_email_analyses from public, anon, authenticated;
grant select on table public.wo_client_email_analyses to authenticated;
grant insert (id, client_id, message_count, first_message_at, last_message_at,
  summary, needs, suggested_reply, uncertainties)
on table public.wo_client_email_analyses to authenticated;

drop policy if exists email_analyses_read on public.wo_client_email_analyses;
create policy email_analyses_read on public.wo_client_email_analyses
for select to authenticated
using (
  (select wo_private.actor_role()) in ('admin', 'coordinator')
  and wo_private.can_access_client(client_id)
);

drop policy if exists email_analyses_insert on public.wo_client_email_analyses;
create policy email_analyses_insert on public.wo_client_email_analyses
for insert to authenticated
with check (
  reviewed_by = (select auth.uid())
  and (select wo_private.actor_role()) in ('admin', 'coordinator')
  and wo_private.can_access_client(client_id)
);

create index if not exists wo_client_email_analyses_recent_idx
on public.wo_client_email_analyses (client_id, reviewed_at desc);

notify pgrst, 'reload schema';
commit;

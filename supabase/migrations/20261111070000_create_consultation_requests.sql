-- Enable async HTTP for database webhooks
create extension if not exists pg_net with schema extensions;

create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  parent_age integer not null check (parent_age > 0 and parent_age < 150),
  city text not null,
  booking_person_name text not null,
  relationship text not null,
  email text not null,
  phone_country_code text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  email_sent_at timestamptz
);

comment on table public.consultation_requests is 'Public consultation booking requests from the marketing site';

alter table public.consultation_requests enable row level security;

create policy "anon_can_insert_consultation_requests"
  on public.consultation_requests
  for insert
  to anon
  with check (true);

grant insert on public.consultation_requests to anon;
grant insert on public.consultation_requests to authenticated;

revoke select, update, delete on public.consultation_requests from anon;
revoke select, update, delete on public.consultation_requests from authenticated;

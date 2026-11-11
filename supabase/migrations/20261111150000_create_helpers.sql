-- Care helpers (server-side only; no public API access)

create table if not exists public.helpers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  gender text not null check (gender in ('female', 'male')),
  email text not null unique,
  phone text not null,
  city text not null,
  languages text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.helpers is 'Care helpers managed server-side only; no anon/authenticated access';

create trigger helpers_set_updated_at
  before update on public.helpers
  for each row
  execute function public.set_updated_at();

alter table public.helpers enable row level security;

-- No policies: anon and authenticated must not read or write helpers.
revoke all on public.helpers from anon;
revoke all on public.helpers from authenticated;
revoke all on public.helpers from public;

-- Sample helpers for testing (plus-aliases keep email unique while sharing one inbox)
insert into public.helpers (full_name, gender, email, phone, city, languages, notes)
values
  ('Priya Raman', 'female', 'nandhu17223+helper01@gmail.com', '+91 98765 01001', 'Chennai', 'Tamil, English', 'Sample helper for testing'),
  ('Lakshmi Devi', 'female', 'nandhu17223+helper02@gmail.com', '+91 98765 01002', 'Chennai', 'Tamil, English', 'Sample helper for testing'),
  ('Anitha Krishnan', 'female', 'nandhu17223+helper03@gmail.com', '+91 98765 01003', 'Chennai', 'Tamil, Hindi', 'Sample helper for testing'),
  ('Meena Sundaram', 'female', 'nandhu17223+helper04@gmail.com', '+91 98765 01004', 'Chennai', 'Tamil, English', 'Sample helper for testing'),
  ('Kavitha Rajan', 'female', 'nandhu17223+helper05@gmail.com', '+91 98765 01005', 'Chennai', 'Tamil, English, Hindi', 'Sample helper for testing'),
  ('Arun Kumar', 'male', 'nandhu17223+helper06@gmail.com', '+91 98765 02001', 'Chennai', 'Tamil, English', 'Sample helper for testing'),
  ('Suresh Babu', 'male', 'nandhu17223+helper07@gmail.com', '+91 98765 02002', 'Chennai', 'Tamil, English', 'Sample helper for testing'),
  ('Vijay Anand', 'male', 'nandhu17223+helper08@gmail.com', '+91 98765 02003', 'Chennai', 'Tamil, Hindi', 'Sample helper for testing'),
  ('Karthik Subramanian', 'male', 'nandhu17223+helper09@gmail.com', '+91 98765 02004', 'Chennai', 'Tamil, English', 'Sample helper for testing'),
  ('Ravi Chandran', 'male', 'nandhu17223+helper10@gmail.com', '+91 98765 02005', 'Chennai', 'Tamil, English, Hindi', 'Sample helper for testing');

-- Feature 3: patient address + helper home location + pincode lookup + distance_km
-- Dataset note: Tamil Nadu pincodes are seeded in the following migration from
-- GeoNames India postal codes (https://download.geonames.org/export/zip/IN.zip),
-- supplemented with sanand0/pincode IN.csv and Chennai locality corrections.

-- ---------------------------------------------------------------------------
-- Pincodes lookup (no public access)
-- ---------------------------------------------------------------------------
create table if not exists public.pincodes (
  pincode text primary key,
  area_name text not null,
  district text,
  state text not null,
  latitude double precision,
  longitude double precision,
  constraint pincodes_pincode_format check (pincode ~ '^\d{6}$')
);

comment on table public.pincodes is
  'India PIN code lookup with coordinates. Seeded from GeoNames India postal codes (TN minimum). No public API access.';

create index if not exists pincodes_state_idx on public.pincodes (state);
create index if not exists pincodes_district_idx on public.pincodes (district);

alter table public.pincodes enable row level security;

revoke all on table public.pincodes from anon;
revoke all on table public.pincodes from authenticated;
revoke all on table public.pincodes from public;

-- ---------------------------------------------------------------------------
-- Haversine distance helper (for next feature)
-- ---------------------------------------------------------------------------
create or replace function public.distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else (
      6371.0 * 2.0 * asin(
        sqrt(
          power(sin(radians(lat2 - lat1) / 2.0), 2)
          + cos(radians(lat1)) * cos(radians(lat2))
            * power(sin(radians(lng2 - lng1) / 2.0), 2)
        )
      )
    )
  end;
$$;

comment on function public.distance_km(double precision, double precision, double precision, double precision) is
  'Great-circle distance in kilometres using the haversine formula.';

revoke all on function public.distance_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.distance_km(double precision, double precision, double precision, double precision) from anon;
revoke all on function public.distance_km(double precision, double precision, double precision, double precision) from authenticated;
grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to postgres;
grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to service_role;

-- ---------------------------------------------------------------------------
-- Auto-fill lat/lng from pincodes
-- ---------------------------------------------------------------------------
create or replace function public.fill_consultation_request_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pin_lat double precision;
  pin_lng double precision;
begin
  if new.pincode is null or new.pincode = '' then
    new.latitude := null;
    new.longitude := null;
    new.location_missing := true;
    return new;
  end if;

  select p.latitude, p.longitude
    into pin_lat, pin_lng
  from public.pincodes p
  where p.pincode = new.pincode;

  if found and pin_lat is not null and pin_lng is not null then
    new.latitude := pin_lat;
    new.longitude := pin_lng;
    new.location_missing := false;
  else
    new.latitude := null;
    new.longitude := null;
    new.location_missing := true;
  end if;

  return new;
end;
$$;

create or replace function public.fill_helper_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pin_lat double precision;
  pin_lng double precision;
begin
  if new.home_pincode is null or new.home_pincode = '' then
    new.latitude := null;
    new.longitude := null;
    new.location_missing := true;
    return new;
  end if;

  select p.latitude, p.longitude
    into pin_lat, pin_lng
  from public.pincodes p
  where p.pincode = new.home_pincode;

  if found and pin_lat is not null and pin_lng is not null then
    new.latitude := pin_lat;
    new.longitude := pin_lng;
    new.location_missing := false;
  else
    new.latitude := null;
    new.longitude := null;
    new.location_missing := true;
  end if;

  return new;
end;
$$;

revoke all on function public.fill_consultation_request_location() from public;
revoke all on function public.fill_consultation_request_location() from anon;
revoke all on function public.fill_consultation_request_location() from authenticated;
grant execute on function public.fill_consultation_request_location() to postgres;
grant execute on function public.fill_consultation_request_location() to service_role;

revoke all on function public.fill_helper_location() from public;
revoke all on function public.fill_helper_location() from anon;
revoke all on function public.fill_helper_location() from authenticated;
grant execute on function public.fill_helper_location() to postgres;
grant execute on function public.fill_helper_location() to service_role;

-- ---------------------------------------------------------------------------
-- consultation_requests address columns
-- ---------------------------------------------------------------------------
alter table public.consultation_requests
  add column if not exists address_line1 text,
  add column if not exists street text,
  add column if not exists area text,
  add column if not exists landmark text,
  add column if not exists pincode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_missing boolean not null default false;

alter table public.consultation_requests
  drop constraint if exists consultation_requests_pincode_format;

alter table public.consultation_requests
  add constraint consultation_requests_pincode_format
  check (pincode is null or pincode ~ '^\d{6}$');

comment on column public.consultation_requests.address_line1 is
  'House / flat number where the helper picks up the patient';
comment on column public.consultation_requests.street is
  'Street / road for patient pickup address';
comment on column public.consultation_requests.area is
  'Area / locality for patient pickup address';
comment on column public.consultation_requests.landmark is
  'Optional landmark near the patient pickup address';
comment on column public.consultation_requests.pincode is
  '6-digit India PIN code for patient pickup address';
comment on column public.consultation_requests.latitude is
  'Latitude filled automatically from pincodes lookup';
comment on column public.consultation_requests.longitude is
  'Longitude filled automatically from pincodes lookup';
comment on column public.consultation_requests.location_missing is
  'True when pincode was missing or not found in pincodes lookup';

drop trigger if exists consultation_requests_fill_location
  on public.consultation_requests;

create trigger consultation_requests_fill_location
  before insert or update of pincode
  on public.consultation_requests
  for each row
  execute function public.fill_consultation_request_location();

-- Keep public write path insert-only; never allow anon/authenticated reads of address columns.
revoke all on table public.consultation_requests from anon;
revoke all on table public.consultation_requests from authenticated;
grant insert on table public.consultation_requests to anon;
grant insert on table public.consultation_requests to authenticated;

-- ---------------------------------------------------------------------------
-- helpers home location columns
-- ---------------------------------------------------------------------------
alter table public.helpers
  add column if not exists home_area text,
  add column if not exists home_pincode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists max_travel_km integer not null default 10,
  add column if not exists location_missing boolean not null default false;

alter table public.helpers
  drop constraint if exists helpers_home_pincode_format;

alter table public.helpers
  add constraint helpers_home_pincode_format
  check (home_pincode is null or home_pincode ~ '^\d{6}$');

alter table public.helpers
  drop constraint if exists helpers_max_travel_km_check;

alter table public.helpers
  add constraint helpers_max_travel_km_check
  check (max_travel_km > 0 and max_travel_km <= 200);

comment on column public.helpers.home_area is
  'Helper home area / locality';
comment on column public.helpers.home_pincode is
  '6-digit India PIN code for helper home location (required for new rows)';
comment on column public.helpers.latitude is
  'Latitude filled automatically from pincodes lookup';
comment on column public.helpers.longitude is
  'Longitude filled automatically from pincodes lookup';
comment on column public.helpers.max_travel_km is
  'Maximum travel distance in kilometres the helper will accept';
comment on column public.helpers.location_missing is
  'True when home_pincode was missing or not found in pincodes lookup';

drop trigger if exists helpers_fill_location on public.helpers;

create trigger helpers_fill_location
  before insert or update of home_pincode
  on public.helpers
  for each row
  execute function public.fill_helper_location();

-- Still server-side only
revoke all on table public.helpers from anon;
revoke all on table public.helpers from authenticated;
revoke all on table public.helpers from public;

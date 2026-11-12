-- Feature 8: staff portal auth, profiles, RLS, audit log, app settings
-- All wall-clock logic uses Asia/Kolkata.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('super_admin', 'manager', 'helper')),
  helper_id uuid references public.helpers (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_helper_id_idx on public.profiles (helper_id);
create index if not exists profiles_is_active_idx on public.profiles (is_active);

comment on table public.profiles is
  'Staff and helper portal profiles. Roles: super_admin, manager, helper.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
revoke all on table public.profiles from public;
grant select on table public.profiles to authenticated;
grant update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Role helpers (security definer; do not trust user_metadata)
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and p.role in ('super_admin', 'manager')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and p.role = 'super_admin'
  );
$$;

revoke all on function public.current_role() from public;
revoke all on function public.current_role() from anon;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_role() to service_role;

revoke all on function public.is_staff() from public;
revoke all on function public.is_staff() from anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_staff() to service_role;

revoke all on function public.is_super_admin() from public;
revoke all on function public.is_super_admin() from anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_super_admin() to service_role;

-- profiles policies
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists profiles_update_super_admin on public.profiles;
create policy profiles_update_super_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Seed existing staff accounts
insert into public.profiles (user_id, full_name, role, is_active)
select u.id, 'Super Admin', 'super_admin', true
from auth.users u
where lower(u.email) = lower('nandhu17223+superadmin@gmail.com')
on conflict (user_id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    is_active = true;

insert into public.profiles (user_id, full_name, role, is_active)
select u.id, 'Manager', 'manager', true
from auth.users u
where lower(u.email) = lower('nandhu17223+manager@gmail.com')
on conflict (user_id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    is_active = true;

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);
create index if not exists audit_log_actor_user_id_idx
  on public.audit_log (actor_user_id);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity, entity_id);

comment on table public.audit_log is
  'Immutable audit trail of staff portal actions.';

alter table public.audit_log enable row level security;

revoke all on table public.audit_log from anon;
revoke all on table public.audit_log from authenticated;
revoke all on table public.audit_log from public;
grant select on table public.audit_log to authenticated;

drop policy if exists audit_log_select_super_admin on public.audit_log;
create policy audit_log_select_super_admin
  on public.audit_log
  for select
  to authenticated
  using (public.is_super_admin());

-- Inserts only via service role / security definer helper
create or replace function public.write_audit_log(
  p_actor_user_id uuid,
  p_actor_role text,
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.audit_log (
    actor_user_id, actor_role, action, entity, entity_id, details
  ) values (
    p_actor_user_id,
    p_actor_role,
    p_action,
    p_entity,
    p_entity_id,
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.write_audit_log(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.write_audit_log(uuid, text, text, text, text, jsonb) from anon;
revoke all on function public.write_audit_log(uuid, text, text, text, text, jsonb) from authenticated;
grant execute on function public.write_audit_log(uuid, text, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

comment on table public.app_settings is
  'Tunable dispatcher / offer settings used by SQL + Edge Functions.';

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from anon;
revoke all on table public.app_settings from authenticated;
revoke all on table public.app_settings from public;
grant select on table public.app_settings to authenticated;
grant update on table public.app_settings to authenticated;

insert into public.app_settings (key, value, description) values
  ('wave_size', '10', 'Helpers offered per automatic wave'),
  ('wave_gap_minutes', '15', 'Minutes between automatic offer waves (active hours)'),
  ('offer_window_hours', '2', 'Active-hours length of the offer window'),
  ('night_start', '21:00', 'Start of night pause (Asia/Kolkata)'),
  ('night_end', '07:00', 'End of night pause (Asia/Kolkata)'),
  ('engaged_window_hours', '3', 'Hours around an appointment when a helper is considered busy'),
  ('senior_offer_expiry_minutes', '60', 'Minutes before a normal senior offer expires'),
  ('urgent_offer_expiry_minutes', '15', 'Minutes before an urgent (< engaged window) senior offer expires')
on conflict (key) do nothing;

drop policy if exists app_settings_select_staff on public.app_settings;
create policy app_settings_select_staff
  on public.app_settings
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists app_settings_update_super_admin on public.app_settings;
create policy app_settings_update_super_admin
  on public.app_settings
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.get_app_setting(p_key text, p_default text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.value from public.app_settings s where s.key = p_key),
    p_default
  );
$$;

create or replace function public.get_app_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(public.get_app_setting(p_key, null), '')::integer,
    p_default
  );
$$;

create or replace function public.get_app_setting_time(p_key text, p_default time)
returns time
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw text;
begin
  raw := public.get_app_setting(p_key, null);
  if raw is null or length(trim(raw)) = 0 then
    return p_default;
  end if;
  begin
    return raw::time;
  exception when others then
    return p_default;
  end;
end;
$$;

revoke all on function public.get_app_setting(text, text) from public;
revoke all on function public.get_app_setting(text, text) from anon;
grant execute on function public.get_app_setting(text, text) to authenticated;
grant execute on function public.get_app_setting(text, text) to service_role;

revoke all on function public.get_app_setting_int(text, integer) from public;
revoke all on function public.get_app_setting_int(text, integer) from anon;
grant execute on function public.get_app_setting_int(text, integer) to authenticated;
grant execute on function public.get_app_setting_int(text, integer) to service_role;

revoke all on function public.get_app_setting_time(text, time) from public;
revoke all on function public.get_app_setting_time(text, time) from anon;
grant execute on function public.get_app_setting_time(text, time) to authenticated;
grant execute on function public.get_app_setting_time(text, time) to service_role;

create or replace function public.touch_app_settings_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists app_settings_touch_updated on public.app_settings;
create trigger app_settings_touch_updated
  before update on public.app_settings
  for each row
  execute function public.touch_app_settings_updated();

-- ---------------------------------------------------------------------------
-- RLS: consultation_requests / helpers / helper_offers / pincodes
-- Staff (active super_admin + manager) can read; anon keeps insert-only on requests.
-- Helper role gets nothing yet.
-- ---------------------------------------------------------------------------
grant select on table public.consultation_requests to authenticated;
grant select on table public.helpers to authenticated;
grant select on table public.helper_offers to authenticated;
grant select on table public.pincodes to authenticated;

drop policy if exists staff_can_select_consultation_requests on public.consultation_requests;
create policy staff_can_select_consultation_requests
  on public.consultation_requests
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists staff_can_select_helpers on public.helpers;
create policy staff_can_select_helpers
  on public.helpers
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists staff_can_select_helper_offers on public.helper_offers;
create policy staff_can_select_helper_offers
  on public.helper_offers
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists staff_can_select_pincodes on public.pincodes;
create policy staff_can_select_pincodes
  on public.pincodes
  for select
  to authenticated
  using (public.is_staff());

-- Keep anon insert-only (policy already exists); ensure no select for anon
revoke select on table public.consultation_requests from anon;
revoke select on table public.helpers from anon;
revoke select on table public.helper_offers from anon;
revoke select on table public.pincodes from anon;

-- ---------------------------------------------------------------------------
-- Settings-aware time / offer helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_within_active_hours(p_ts timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select (
    (p_ts at time zone 'Asia/Kolkata')::time
      >= public.get_app_setting_time('night_end', time '07:00')
    and (p_ts at time zone 'Asia/Kolkata')::time
      < public.get_app_setting_time('night_start', time '21:00')
  );
$$;

create or replace function public.next_active_start(p_ts timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  local_ts timestamp;
  day_start time := public.get_app_setting_time('night_end', time '07:00');
  day_end time := public.get_app_setting_time('night_start', time '21:00');
begin
  local_ts := p_ts at time zone 'Asia/Kolkata';
  if local_ts::time < day_start then
    local_ts := date_trunc('day', local_ts) + day_start;
  elsif local_ts::time >= day_end then
    local_ts := date_trunc('day', local_ts) + interval '1 day' + day_start;
  end if;
  return local_ts at time zone 'Asia/Kolkata';
end;
$$;

create or replace function public.add_active_minutes(
  p_start timestamptz,
  p_minutes integer
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  local_ts timestamp;
  minutes_left integer := greatest(p_minutes, 0);
  day_date date;
  day_end timestamp;
  available integer;
  day_start time := public.get_app_setting_time('night_end', time '07:00');
  night_start time := public.get_app_setting_time('night_start', time '21:00');
begin
  if p_minutes is null or p_minutes <= 0 then
    return public.next_active_start(p_start);
  end if;

  local_ts := public.next_active_start(p_start) at time zone 'Asia/Kolkata';

  while minutes_left > 0 loop
    day_date := local_ts::date;
    day_end := day_date + night_start;

    if local_ts::time < day_start then
      local_ts := day_date + day_start;
    end if;

    if local_ts >= day_end then
      local_ts := (day_date + 1) + day_start;
      continue;
    end if;

    available := floor(extract(epoch from (day_end - local_ts)) / 60.0)::integer;
    if available <= 0 then
      local_ts := (day_date + 1) + day_start;
      continue;
    end if;

    if minutes_left <= available then
      local_ts := local_ts + make_interval(mins => minutes_left);
      minutes_left := 0;
    else
      minutes_left := minutes_left - available;
      local_ts := (day_date + 1) + day_start;
    end if;
  end loop;

  return local_ts at time zone 'Asia/Kolkata';
end;
$$;

create or replace function public.compute_offer_window_ends_at(
  p_start timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select public.add_active_minutes(
    public.next_active_start(p_start),
    greatest(public.get_app_setting_int('offer_window_hours', 2), 1) * 60
  );
$$;

create or replace function public.engaged_window_seconds()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(public.get_app_setting_int('engaged_window_hours', 3), 1) * 3600;
$$;

revoke all on function public.engaged_window_seconds() from public;
revoke all on function public.engaged_window_seconds() from anon;
grant execute on function public.engaged_window_seconds() to authenticated;
grant execute on function public.engaged_window_seconds() to service_role;

-- Update find_suitable_helpers default limit + engaged window from settings
create or replace function public.find_suitable_helpers(
  p_request_id uuid,
  p_limit integer default null
)
returns table (
  helper_id uuid,
  full_name text,
  email text,
  phone text,
  gender text,
  distance_km double precision,
  upcoming_assigned_jobs bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  req record;
  appt timestamptz;
  wave_limit integer := greatest(
    coalesce(p_limit, public.get_app_setting_int('wave_size', 10)),
    0
  );
  engaged_secs integer := public.engaged_window_seconds();
begin
  select *
    into req
  from public.consultation_requests cr
  where cr.id = p_request_id;

  if not found then
    return;
  end if;

  if req.latitude is null or req.longitude is null or req.location_missing then
    return;
  end if;

  appt := public.appointment_timestamptz(req.appointment_date, req.appointment_time);

  return query
  with ranked as (
    select
      h.id as helper_id,
      h.full_name,
      h.email,
      h.phone,
      h.gender,
      public.distance_km(req.latitude, req.longitude, h.latitude, h.longitude) as distance_km,
      (
        select count(*)::bigint
        from public.consultation_requests assigned
        where assigned.assigned_helper_id = h.id
          and assigned.status = 'assigned'
          and public.appointment_timestamptz(
            assigned.appointment_date,
            assigned.appointment_time
          ) >= now()
      ) as upcoming_assigned_jobs
    from public.helpers h
    where h.is_active = true
      and h.latitude is not null
      and h.longitude is not null
      and h.location_missing = false
      and (
        req.helper_preference = 'any'
        or h.gender = req.helper_preference
      )
      and public.distance_km(req.latitude, req.longitude, h.latitude, h.longitude)
            <= h.max_travel_km
      and not exists (
        select 1
        from public.helper_offers ho
        where ho.request_id = p_request_id
          and ho.helper_id = h.id
      )
      and not exists (
        select 1
        from public.consultation_requests engaged
        where engaged.assigned_helper_id = h.id
          and engaged.status = 'assigned'
          and abs(
            extract(
              epoch from (
                public.appointment_timestamptz(
                  engaged.appointment_date,
                  engaged.appointment_time
                ) - appt
              )
            )
          ) < engaged_secs
      )
  )
  select
    r.helper_id,
    r.full_name,
    r.email,
    r.phone,
    r.gender,
    r.distance_km,
    r.upcoming_assigned_jobs
  from ranked r
  order by r.distance_km asc nulls last, r.upcoming_assigned_jobs asc, r.full_name asc
  limit wave_limit;
end;
$$;

-- create_senior_offer: settings-aware engaged + expiry
create or replace function public.create_senior_offer(
  p_request_id uuid,
  p_helper_id uuid,
  p_token_hash text,
  p_distance_km double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.consultation_requests%rowtype;
  helper_row public.helpers%rowtype;
  appt timestamptz;
  engaged boolean;
  next_wave integer;
  offer_id uuid;
  hours_to_appt double precision;
  expiry_minutes integer;
  engaged_secs integer := public.engaged_window_seconds();
  engaged_hours integer := public.get_app_setting_int('engaged_window_hours', 3);
  urgent_expiry integer := public.get_app_setting_int('urgent_offer_expiry_minutes', 15);
  normal_expiry integer := public.get_app_setting_int('senior_offer_expiry_minutes', 60);
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select * into req from public.consultation_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;

  if req.status not in ('needs_senior', 'senior_offered') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'message', 'Request is not awaiting senior assignment.'
    );
  end if;

  if p_helper_id = any (coalesce(req.previous_helper_ids, '{}'::uuid[])) then
    return jsonb_build_object(
      'ok', false,
      'code', 'helper_dropped_before',
      'message', 'This helper previously dropped out of this request.'
    );
  end if;

  select * into helper_row from public.helpers where id = p_helper_id;
  if not found or helper_row.is_active is not true then
    return jsonb_build_object('ok', false, 'code', 'helper_not_found');
  end if;

  appt := public.appointment_timestamptz(req.appointment_date, req.appointment_time);
  if now() >= appt then
    return jsonb_build_object('ok', false, 'code', 'appointment_passed');
  end if;

  select exists (
    select 1
    from public.consultation_requests engaged_req
    where engaged_req.assigned_helper_id = p_helper_id
      and engaged_req.status = 'assigned'
      and abs(
        extract(
          epoch from (
            public.appointment_timestamptz(
              engaged_req.appointment_date,
              engaged_req.appointment_time
            ) - appt
          )
        )
      ) < engaged_secs
  ) into engaged;

  if engaged then
    return jsonb_build_object(
      'ok', false,
      'code', 'helper_busy',
      'message', 'Helper is busy near this appointment time.'
    );
  end if;

  update public.helper_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now())
  where request_id = p_request_id
    and status = 'sent'
    and source = 'senior'
    and helper_id <> p_helper_id;

  select coalesce(max(wave_number), 0) + 1
    into next_wave
  from public.helper_offers
  where request_id = p_request_id;

  insert into public.helper_offers (
    request_id, helper_id, wave_number, status, token_hash, distance_km, source, sent_at, responded_at
  ) values (
    p_request_id, p_helper_id, greatest(next_wave, 1), 'sent', p_token_hash, p_distance_km, 'senior', now(), null
  )
  on conflict (request_id, helper_id) do update set
    wave_number = excluded.wave_number,
    status = 'sent',
    token_hash = excluded.token_hash,
    distance_km = excluded.distance_km,
    source = 'senior',
    sent_at = now(),
    responded_at = null
  returning id into offer_id;

  update public.consultation_requests
  set status = 'senior_offered'
  where id = p_request_id;

  hours_to_appt := extract(epoch from (appt - now())) / 3600.0;
  expiry_minutes := case
    when hours_to_appt < engaged_hours then urgent_expiry
    else normal_expiry
  end;

  return jsonb_build_object(
    'ok', true,
    'code', 'offered',
    'offer_id', offer_id,
    'wave_number', greatest(next_wave, 1),
    'helper_id', p_helper_id,
    'request_id', p_request_id,
    'expiry_minutes', expiry_minutes,
    'urgent', hours_to_appt < engaged_hours
  );
end;
$$;

-- effective_reminder_at: night window from settings
create or replace function public.effective_reminder_at(
  p_appointment timestamptz,
  p_hours_before integer,
  p_assigned_at timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  nominal timestamptz;
  local_ts timestamp;
  shifted timestamptz;
  night_start time := public.get_app_setting_time('night_start', time '21:00');
  night_end time := public.get_app_setting_time('night_end', time '07:00');
begin
  if p_appointment is null or p_hours_before is null then
    return null;
  end if;

  nominal := p_appointment - make_interval(hours => p_hours_before);
  local_ts := nominal at time zone 'Asia/Kolkata';

  if local_ts::time >= night_start or local_ts::time < night_end then
    if local_ts::time < night_end then
      shifted := ((local_ts::date - 1) + night_start) at time zone 'Asia/Kolkata';
    else
      shifted := (local_ts::date + night_start) at time zone 'Asia/Kolkata';
    end if;
  else
    shifted := nominal;
  end if;

  if p_assigned_at is not null and shifted < p_assigned_at then
    return null;
  end if;

  return shifted;
end;
$$;

-- Grant staff execute on list_helpers_for_senior (used by portal via edge fn mostly)
grant execute on function public.list_helpers_for_senior(uuid) to authenticated;

-- Feature 4: offer consultation requests to helpers in waves (Accept/Decline)
-- All wall-clock logic uses Asia/Kolkata.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- consultation_requests: offer / assignment columns
-- ---------------------------------------------------------------------------
alter table public.consultation_requests
  add column if not exists status text not null default 'new',
  add column if not exists assigned_helper_id uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists offer_window_ends_at timestamptz,
  add column if not exists needs_senior_reason text;

alter table public.consultation_requests
  drop constraint if exists consultation_requests_status_check;

alter table public.consultation_requests
  add constraint consultation_requests_status_check
  check (status in ('new', 'offered', 'assigned', 'needs_senior', 'cancelled', 'completed'));

alter table public.consultation_requests
  drop constraint if exists consultation_requests_needs_senior_reason_check;

alter table public.consultation_requests
  add constraint consultation_requests_needs_senior_reason_check
  check (
    needs_senior_reason is null
    or needs_senior_reason in (
      'short_notice',
      'no_acceptance',
      'no_suitable_helpers',
      'all_declined'
    )
  );

alter table public.consultation_requests
  drop constraint if exists consultation_requests_assigned_helper_id_fkey;

alter table public.consultation_requests
  add constraint consultation_requests_assigned_helper_id_fkey
  foreign key (assigned_helper_id) references public.helpers (id);

create index if not exists consultation_requests_status_idx
  on public.consultation_requests (status);

create index if not exists consultation_requests_assigned_helper_id_idx
  on public.consultation_requests (assigned_helper_id);

comment on column public.consultation_requests.status is
  'Request lifecycle: new, offered, assigned, needs_senior, cancelled, completed';
comment on column public.consultation_requests.assigned_helper_id is
  'Helper who accepted the offer';
comment on column public.consultation_requests.assigned_at is
  'When the request was assigned to a helper';
comment on column public.consultation_requests.offer_window_ends_at is
  'End of the 2-hour active-hours (07:00–21:00 Asia/Kolkata) offer window';
comment on column public.consultation_requests.needs_senior_reason is
  'Why the request needs senior attention';

-- ---------------------------------------------------------------------------
-- helper_offers
-- ---------------------------------------------------------------------------
create table if not exists public.helper_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.consultation_requests (id) on delete cascade,
  helper_id uuid not null references public.helpers (id),
  wave_number integer not null check (wave_number > 0),
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'declined', 'withdrawn', 'expired')),
  token_hash text not null,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  distance_km double precision,
  unique (request_id, helper_id)
);

comment on table public.helper_offers is
  'Per-helper offer tokens for consultation requests. Server-side only; store SHA-256(token) only.';

create index if not exists helper_offers_request_id_idx
  on public.helper_offers (request_id);

create index if not exists helper_offers_helper_id_idx
  on public.helper_offers (helper_id);

create index if not exists helper_offers_token_hash_idx
  on public.helper_offers (token_hash);

create index if not exists helper_offers_status_idx
  on public.helper_offers (status);

alter table public.helper_offers enable row level security;

revoke all on table public.helper_offers from anon;
revoke all on table public.helper_offers from authenticated;
revoke all on table public.helper_offers from public;

-- Keep consultation_requests insert-only for public roles
revoke all on table public.consultation_requests from anon;
revoke all on table public.consultation_requests from authenticated;
grant insert on table public.consultation_requests to anon;
grant insert on table public.consultation_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Time helpers (Asia/Kolkata active hours 07:00–21:00)
-- ---------------------------------------------------------------------------
create or replace function public.ist_local_now()
returns timestamp
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Kolkata');
$$;

create or replace function public.appointment_timestamptz(
  p_date date,
  p_time time
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select (p_date + p_time) at time zone 'Asia/Kolkata';
$$;

create or replace function public.is_within_active_hours(p_ts timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select ((p_ts at time zone 'Asia/Kolkata')::time >= time '07:00'
      and (p_ts at time zone 'Asia/Kolkata')::time < time '21:00');
$$;

create or replace function public.next_active_start(p_ts timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  local_ts timestamp;
begin
  local_ts := p_ts at time zone 'Asia/Kolkata';
  if local_ts::time < time '07:00' then
    local_ts := date_trunc('day', local_ts) + time '07:00';
  elsif local_ts::time >= time '21:00' then
    local_ts := date_trunc('day', local_ts) + interval '1 day' + time '07:00';
  end if;
  return local_ts at time zone 'Asia/Kolkata';
end;
$$;

-- Add N minutes counting only 07:00–21:00 Asia/Kolkata
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
begin
  if p_minutes is null or p_minutes <= 0 then
    return public.next_active_start(p_start);
  end if;

  local_ts := public.next_active_start(p_start) at time zone 'Asia/Kolkata';

  while minutes_left > 0 loop
    day_date := local_ts::date;
    day_end := day_date + time '21:00';

    if local_ts::time < time '07:00' then
      local_ts := day_date + time '07:00';
    end if;

    if local_ts >= day_end then
      local_ts := (day_date + 1) + time '07:00';
      continue;
    end if;

    available := floor(extract(epoch from (day_end - local_ts)) / 60.0)::integer;
    if available <= 0 then
      local_ts := (day_date + 1) + time '07:00';
      continue;
    end if;

    if minutes_left <= available then
      local_ts := local_ts + make_interval(mins => minutes_left);
      minutes_left := 0;
    else
      minutes_left := minutes_left - available;
      local_ts := (day_date + 1) + time '07:00';
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
  select public.add_active_minutes(public.next_active_start(p_start), 120);
$$;

revoke all on function public.ist_local_now() from public;
revoke all on function public.ist_local_now() from anon;
revoke all on function public.ist_local_now() from authenticated;
grant execute on function public.ist_local_now() to postgres;
grant execute on function public.ist_local_now() to service_role;

revoke all on function public.appointment_timestamptz(date, time) from public;
revoke all on function public.appointment_timestamptz(date, time) from anon;
revoke all on function public.appointment_timestamptz(date, time) from authenticated;
grant execute on function public.appointment_timestamptz(date, time) to postgres;
grant execute on function public.appointment_timestamptz(date, time) to service_role;

revoke all on function public.is_within_active_hours(timestamptz) from public;
revoke all on function public.is_within_active_hours(timestamptz) from anon;
revoke all on function public.is_within_active_hours(timestamptz) from authenticated;
grant execute on function public.is_within_active_hours(timestamptz) to postgres;
grant execute on function public.is_within_active_hours(timestamptz) to service_role;

revoke all on function public.next_active_start(timestamptz) from public;
revoke all on function public.next_active_start(timestamptz) from anon;
revoke all on function public.next_active_start(timestamptz) from authenticated;
grant execute on function public.next_active_start(timestamptz) to postgres;
grant execute on function public.next_active_start(timestamptz) to service_role;

revoke all on function public.add_active_minutes(timestamptz, integer) from public;
revoke all on function public.add_active_minutes(timestamptz, integer) from anon;
revoke all on function public.add_active_minutes(timestamptz, integer) from authenticated;
grant execute on function public.add_active_minutes(timestamptz, integer) to postgres;
grant execute on function public.add_active_minutes(timestamptz, integer) to service_role;

revoke all on function public.compute_offer_window_ends_at(timestamptz) from public;
revoke all on function public.compute_offer_window_ends_at(timestamptz) from anon;
revoke all on function public.compute_offer_window_ends_at(timestamptz) from authenticated;
grant execute on function public.compute_offer_window_ends_at(timestamptz) to postgres;
grant execute on function public.compute_offer_window_ends_at(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Suitable helpers (excludes anyone already offered this request)
-- ---------------------------------------------------------------------------
create or replace function public.find_suitable_helpers(
  p_request_id uuid,
  p_limit integer default 10
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
          ) < 3 * 3600
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
  limit greatest(coalesce(p_limit, 10), 0);
end;
$$;

revoke all on function public.find_suitable_helpers(uuid, integer) from public;
revoke all on function public.find_suitable_helpers(uuid, integer) from anon;
revoke all on function public.find_suitable_helpers(uuid, integer) from authenticated;
grant execute on function public.find_suitable_helpers(uuid, integer) to postgres;
grant execute on function public.find_suitable_helpers(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Mark request needs_senior + expire open offers
-- ---------------------------------------------------------------------------
create or replace function public.mark_request_needs_senior(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consultation_requests
  set
    status = 'needs_senior',
    needs_senior_reason = p_reason
  where id = p_request_id
    and status = 'offered';

  update public.helper_offers
  set
    status = 'expired',
    responded_at = coalesce(responded_at, now())
  where request_id = p_request_id
    and status = 'sent';
end;
$$;

revoke all on function public.mark_request_needs_senior(uuid, text) from public;
revoke all on function public.mark_request_needs_senior(uuid, text) from anon;
revoke all on function public.mark_request_needs_senior(uuid, text) from authenticated;
grant execute on function public.mark_request_needs_senior(uuid, text) to postgres;
grant execute on function public.mark_request_needs_senior(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Accept offer (row locks, single winner)
-- ---------------------------------------------------------------------------
create or replace function public.accept_helper_offer(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.helper_offers%rowtype;
  req public.consultation_requests%rowtype;
  appt timestamptz;
  engaged boolean;
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'Invalid offer link.');
  end if;

  select *
    into offer_row
  from public.helper_offers
  where token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'Invalid offer link.');
  end if;

  select *
    into req
  from public.consultation_requests
  where id = offer_row.request_id
  for update;

  appt := public.appointment_timestamptz(req.appointment_date, req.appointment_time);

  -- Prefer the user-facing "already taken" message once assigned
  if req.status = 'assigned' then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_taken',
      'message', 'Sorry, another helper already accepted.'
    );
  end if;

  if offer_row.status <> 'sent' or now() >= appt then
    return jsonb_build_object('ok', false, 'code', 'token_invalid', 'message', 'This offer link is no longer valid.');
  end if;

  if req.status <> 'offered' then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_offered',
      'message', 'This appointment is no longer available.'
    );
  end if;

  select exists (
    select 1
    from public.consultation_requests engaged_req
    where engaged_req.assigned_helper_id = offer_row.helper_id
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
      ) < 3 * 3600
  ) into engaged;

  if engaged then
    return jsonb_build_object(
      'ok', false,
      'code', 'helper_engaged',
      'message', 'You already have an appointment at this time.'
    );
  end if;

  update public.consultation_requests
  set
    status = 'assigned',
    assigned_helper_id = offer_row.helper_id,
    assigned_at = now(),
    needs_senior_reason = null
  where id = req.id;

  update public.helper_offers
  set
    status = 'accepted',
    responded_at = now()
  where id = offer_row.id;

  update public.helper_offers
  set
    status = 'withdrawn',
    responded_at = coalesce(responded_at, now())
  where request_id = req.id
    and id <> offer_row.id
    and status = 'sent';

  return jsonb_build_object(
    'ok', true,
    'code', 'accepted',
    'message', 'This appointment is yours!',
    'request_id', req.id,
    'helper_id', offer_row.helper_id
  );
end;
$$;

revoke all on function public.accept_helper_offer(text) from public;
revoke all on function public.accept_helper_offer(text) from anon;
revoke all on function public.accept_helper_offer(text) from authenticated;
grant execute on function public.accept_helper_offer(text) to postgres;
grant execute on function public.accept_helper_offer(text) to service_role;

-- ---------------------------------------------------------------------------
-- Decline offer
-- ---------------------------------------------------------------------------
create or replace function public.decline_helper_offer(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.helper_offers%rowtype;
  req public.consultation_requests%rowtype;
  appt timestamptz;
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'Invalid offer link.');
  end if;

  select *
    into offer_row
  from public.helper_offers
  where token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'Invalid offer link.');
  end if;

  select *
    into req
  from public.consultation_requests
  where id = offer_row.request_id
  for update;

  appt := public.appointment_timestamptz(req.appointment_date, req.appointment_time);

  if offer_row.status <> 'sent' or now() >= appt then
    return jsonb_build_object('ok', false, 'code', 'token_invalid', 'message', 'This offer link is no longer valid.');
  end if;

  if req.status = 'assigned' then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_taken',
      'message', 'Sorry, another helper already accepted.'
    );
  end if;

  update public.helper_offers
  set
    status = 'declined',
    responded_at = now()
  where id = offer_row.id;

  return jsonb_build_object(
    'ok', true,
    'code', 'declined',
    'message', 'Thanks, noted.',
    'request_id', req.id,
    'helper_id', offer_row.helper_id,
    'wave_number', offer_row.wave_number,
    'request_status', req.status
  );
end;
$$;

revoke all on function public.decline_helper_offer(text) from public;
revoke all on function public.decline_helper_offer(text) from anon;
revoke all on function public.decline_helper_offer(text) from authenticated;
grant execute on function public.decline_helper_offer(text) to postgres;
grant execute on function public.decline_helper_offer(text) to service_role;

-- ---------------------------------------------------------------------------
-- On insert: short notice vs start offering
-- ---------------------------------------------------------------------------
create or replace function public.consultation_request_start_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appt timestamptz;
  hours_away double precision;
begin
  -- Only initialize when still at default 'new'
  if new.status is distinct from 'new' then
    return new;
  end if;

  appt := public.appointment_timestamptz(new.appointment_date, new.appointment_time);
  hours_away := extract(epoch from (appt - now())) / 3600.0;

  if hours_away < 4 then
    new.status := 'needs_senior';
    new.needs_senior_reason := 'short_notice';
    new.offer_window_ends_at := null;
    return new;
  end if;

  new.status := 'offered';
  new.needs_senior_reason := null;
  new.offer_window_ends_at := public.compute_offer_window_ends_at(now());
  return new;
end;
$$;

create or replace function public.consultation_request_dispatch_offers()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  -- After commit-visible insert: dispatch wave 1 during active hours only.
  -- Overnight inserts wait until 07:00 Asia/Kolkata via pg_cron.
  if new.status = 'offered' and public.is_within_active_hours(now()) then
    perform net.http_post(
      url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/offer-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
      ),
      body := jsonb_build_object(
        'request_id', new.id,
        'reason', 'insert'
      ),
      timeout_milliseconds := 5000
    );
  end if;
  return new;
end;
$$;

revoke all on function public.consultation_request_start_offers() from public;
revoke all on function public.consultation_request_start_offers() from anon;
revoke all on function public.consultation_request_start_offers() from authenticated;
grant execute on function public.consultation_request_start_offers() to postgres;
grant execute on function public.consultation_request_start_offers() to service_role;

revoke all on function public.consultation_request_dispatch_offers() from public;
revoke all on function public.consultation_request_dispatch_offers() from anon;
revoke all on function public.consultation_request_dispatch_offers() from authenticated;
grant execute on function public.consultation_request_dispatch_offers() to postgres;
grant execute on function public.consultation_request_dispatch_offers() to service_role;

drop trigger if exists consultation_requests_start_offers on public.consultation_requests;
drop trigger if exists consultation_requests_dispatch_offers on public.consultation_requests;

create trigger consultation_requests_start_offers
  before insert on public.consultation_requests
  for each row
  execute function public.consultation_request_start_offers();

create trigger consultation_requests_dispatch_offers
  after insert on public.consultation_requests
  for each row
  execute function public.consultation_request_dispatch_offers();

-- ---------------------------------------------------------------------------
-- pg_cron: offer-dispatcher every 5 minutes
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'offer-dispatcher-every-5-min') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'offer-dispatcher-every-5-min' limit 1));
  end if;
exception
  when undefined_table then
    null;
  when undefined_function then
    null;
end;
$$;

select cron.schedule(
  'offer-dispatcher-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/offer-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
    ),
    body := jsonb_build_object('reason', 'cron'),
    timeout_milliseconds := 10000
  );
  $$
);

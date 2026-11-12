-- Feature 7: helper reminders, attendance confirmation, helper drop-out
-- All wall-clock logic uses Asia/Kolkata.

-- ---------------------------------------------------------------------------
-- consultation_requests: reminder / confirmation / drop-out columns
-- ---------------------------------------------------------------------------
alter table public.consultation_requests
  add column if not exists reminder_12h_sent_at timestamptz,
  add column if not exists reminder_6h_sent_at timestamptz,
  add column if not exists helper_confirmed_at timestamptz,
  add column if not exists confirmed_by text,
  add column if not exists no_confirm_alert_sent_at timestamptz,
  add column if not exists no_confirm_second_alert_sent_at timestamptz,
  add column if not exists helper_dropped_at timestamptz,
  add column if not exists previous_helper_ids uuid[] not null default '{}';

alter table public.consultation_requests
  drop constraint if exists consultation_requests_confirmed_by_check;

alter table public.consultation_requests
  add constraint consultation_requests_confirmed_by_check
  check (
    confirmed_by is null
    or confirmed_by in ('helper', 'senior', 'auto_late_accept')
  );

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
      'all_declined',
      'helper_dropped',
      'helper_not_confirmed'
    )
  );

comment on column public.consultation_requests.reminder_12h_sent_at is
  'When the 12-hour helper reminder email was sent (idempotent)';
comment on column public.consultation_requests.reminder_6h_sent_at is
  'When the 6-hour helper reminder email was sent (idempotent)';
comment on column public.consultation_requests.helper_confirmed_at is
  'When the assigned helper confirmed attendance';
comment on column public.consultation_requests.confirmed_by is
  'Who confirmed: helper, senior (by phone), or auto_late_accept';
comment on column public.consultation_requests.no_confirm_alert_sent_at is
  'When the 3-hour senior-only no-confirm alert was sent';
comment on column public.consultation_requests.no_confirm_second_alert_sent_at is
  'When the 1-hour senior-only second no-confirm alert was sent';
comment on column public.consultation_requests.helper_dropped_at is
  'When the most recent assigned helper dropped out / was released';
comment on column public.consultation_requests.previous_helper_ids is
  'Helpers who dropped out or were released; must not be re-selected';

-- ---------------------------------------------------------------------------
-- assignment_tokens: hashed tokens for confirm / can't-make-it actions
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.consultation_requests (id) on delete cascade,
  helper_id uuid not null references public.helpers (id),
  token_hash text not null,
  created_at timestamptz not null default now(),
  invalidated_at timestamptz,
  unique (token_hash)
);

comment on table public.assignment_tokens is
  'Hashed tokens for helper attendance confirm / drop-out links. Server-side only.';

create index if not exists assignment_tokens_request_id_idx
  on public.assignment_tokens (request_id);

create index if not exists assignment_tokens_helper_id_idx
  on public.assignment_tokens (helper_id);

create index if not exists assignment_tokens_active_idx
  on public.assignment_tokens (request_id, helper_id)
  where invalidated_at is null;

alter table public.assignment_tokens enable row level security;

revoke all on table public.assignment_tokens from anon;
revoke all on table public.assignment_tokens from authenticated;
revoke all on table public.assignment_tokens from public;

-- ---------------------------------------------------------------------------
-- Reminder schedule helper (Asia/Kolkata night shift 21:00–07:00 → 21:00 prior)
-- ---------------------------------------------------------------------------
create or replace function public.effective_reminder_at(
  p_appointment timestamptz,
  p_hours_before integer,
  p_assigned_at timestamptz
)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  nominal timestamptz;
  local_ts timestamp;
  shifted timestamptz;
begin
  if p_appointment is null or p_hours_before is null then
    return null;
  end if;

  nominal := p_appointment - make_interval(hours => p_hours_before);
  local_ts := nominal at time zone 'Asia/Kolkata';

  -- Night window: 21:00 inclusive through 07:00 exclusive → shift to 21:00 evening before
  if local_ts::time >= time '21:00' or local_ts::time < time '07:00' then
    if local_ts::time < time '07:00' then
      shifted := ((local_ts::date - 1) + time '21:00') at time zone 'Asia/Kolkata';
    else
      -- already at/after 21:00 same calendar day → use 21:00 that day
      shifted := (local_ts::date + time '21:00') at time zone 'Asia/Kolkata';
    end if;
  else
    shifted := nominal;
  end if;

  -- Only use the shifted time if it is still after assignment
  if p_assigned_at is not null and shifted < p_assigned_at then
    return null;
  end if;

  return shifted;
end;
$$;

revoke all on function public.effective_reminder_at(timestamptz, integer, timestamptz) from public;
revoke all on function public.effective_reminder_at(timestamptz, integer, timestamptz) from anon;
revoke all on function public.effective_reminder_at(timestamptz, integer, timestamptz) from authenticated;
grant execute on function public.effective_reminder_at(timestamptz, integer, timestamptz) to postgres;
grant execute on function public.effective_reminder_at(timestamptz, integer, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Create / rotate an assignment action token
-- ---------------------------------------------------------------------------
create or replace function public.create_assignment_token(
  p_request_id uuid,
  p_helper_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_id uuid;
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Keep prior tokens valid until drop-out / release so older emails still work.
  insert into public.assignment_tokens (request_id, helper_id, token_hash)
  values (p_request_id, p_helper_id, p_token_hash)
  returning id into token_id;

  return jsonb_build_object('ok', true, 'token_id', token_id);
end;
$$;

revoke all on function public.create_assignment_token(uuid, uuid, text) from public;
revoke all on function public.create_assignment_token(uuid, uuid, text) from anon;
revoke all on function public.create_assignment_token(uuid, uuid, text) from authenticated;
grant execute on function public.create_assignment_token(uuid, uuid, text) to postgres;
grant execute on function public.create_assignment_token(uuid, uuid, text) to service_role;

create or replace function public.invalidate_assignment_tokens(
  p_request_id uuid,
  p_helper_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assignment_tokens
  set invalidated_at = coalesce(invalidated_at, now())
  where request_id = p_request_id
    and invalidated_at is null
    and (p_helper_id is null or helper_id = p_helper_id);
end;
$$;

revoke all on function public.invalidate_assignment_tokens(uuid, uuid) from public;
revoke all on function public.invalidate_assignment_tokens(uuid, uuid) from anon;
revoke all on function public.invalidate_assignment_tokens(uuid, uuid) from authenticated;
grant execute on function public.invalidate_assignment_tokens(uuid, uuid) to postgres;
grant execute on function public.invalidate_assignment_tokens(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Accept offer: reset confirmation/reminder fields; late-accept auto-confirm
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
  hours_to_appt double precision;
  confirm_at timestamptz;
  confirm_by text;
  is_replacement boolean;
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

  if req.status not in ('offered', 'senior_offered') then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_offered',
      'message', 'This appointment is no longer available.'
    );
  end if;

  -- Block helpers who previously dropped out of this request
  if offer_row.helper_id = any (coalesce(req.previous_helper_ids, '{}'::uuid[])) then
    return jsonb_build_object(
      'ok', false,
      'code', 'helper_dropped_before',
      'message', 'This helper previously dropped out of this request.'
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

  hours_to_appt := extract(epoch from (appt - now())) / 3600.0;
  if hours_to_appt < 6 then
    confirm_at := now();
    confirm_by := 'auto_late_accept';
  else
    confirm_at := null;
    confirm_by := null;
  end if;

  is_replacement := coalesce(cardinality(req.previous_helper_ids), 0) > 0;

  update public.consultation_requests
  set
    status = 'assigned',
    assigned_helper_id = offer_row.helper_id,
    assigned_at = now(),
    needs_senior_reason = null,
    helper_confirmed_at = confirm_at,
    confirmed_by = confirm_by,
    reminder_12h_sent_at = null,
    reminder_6h_sent_at = null,
    no_confirm_alert_sent_at = null,
    no_confirm_second_alert_sent_at = null,
    helper_dropped_at = null
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
    'helper_id', offer_row.helper_id,
    'source', offer_row.source,
    'is_replacement', is_replacement,
    'auto_confirmed', confirm_by is not null
  );
end;
$$;

revoke all on function public.accept_helper_offer(text) from public;
revoke all on function public.accept_helper_offer(text) from anon;
revoke all on function public.accept_helper_offer(text) from authenticated;
grant execute on function public.accept_helper_offer(text) to postgres;
grant execute on function public.accept_helper_offer(text) to service_role;

-- ---------------------------------------------------------------------------
-- Helper confirms attendance via token
-- ---------------------------------------------------------------------------
create or replace function public.confirm_helper_attendance(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.assignment_tokens%rowtype;
  req public.consultation_requests%rowtype;
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'Invalid link.');
  end if;

  select *
    into token_row
  from public.assignment_tokens
  where token_hash = p_token_hash
  for update;

  if not found or token_row.invalidated_at is not null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'This link is no longer valid.');
  end if;

  select *
    into req
  from public.consultation_requests
  where id = token_row.request_id
  for update;

  if req.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'cancelled', 'message', 'This appointment was cancelled.');
  end if;

  if req.status <> 'assigned'
     or req.assigned_helper_id is distinct from token_row.helper_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_assigned',
      'message', 'This appointment is no longer assigned to you.'
    );
  end if;

  if req.helper_confirmed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_confirmed',
      'message', 'Thanks, see you there!'
    );
  end if;

  update public.consultation_requests
  set
    helper_confirmed_at = now(),
    confirmed_by = 'helper'
  where id = req.id;

  return jsonb_build_object(
    'ok', true,
    'code', 'confirmed',
    'message', 'Thanks, see you there!',
    'request_id', req.id,
    'helper_id', token_row.helper_id
  );
end;
$$;

revoke all on function public.confirm_helper_attendance(text) from public;
revoke all on function public.confirm_helper_attendance(text) from anon;
revoke all on function public.confirm_helper_attendance(text) from authenticated;
grant execute on function public.confirm_helper_attendance(text) to postgres;
grant execute on function public.confirm_helper_attendance(text) to service_role;

-- ---------------------------------------------------------------------------
-- Shared drop-out / release logic
-- ---------------------------------------------------------------------------
create or replace function public.release_assigned_helper(
  p_request_id uuid,
  p_reason text,
  p_expected_helper_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.consultation_requests%rowtype;
  released_helper_id uuid;
begin
  if p_reason is null or p_reason not in ('helper_dropped', 'helper_not_confirmed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;

  select *
    into req
  from public.consultation_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;

  if req.status <> 'assigned' or req.assigned_helper_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_assigned', 'message', 'Request is not currently assigned.');
  end if;

  if p_expected_helper_id is not null
     and req.assigned_helper_id is distinct from p_expected_helper_id then
    return jsonb_build_object('ok', false, 'code', 'helper_mismatch');
  end if;

  released_helper_id := req.assigned_helper_id;

  update public.consultation_requests
  set
    previous_helper_ids = case
      when released_helper_id = any (coalesce(previous_helper_ids, '{}'::uuid[]))
        then previous_helper_ids
      else array_append(coalesce(previous_helper_ids, '{}'::uuid[]), released_helper_id)
    end,
    assigned_helper_id = null,
    assigned_at = null,
    helper_dropped_at = now(),
    status = 'needs_senior',
    needs_senior_reason = p_reason,
    helper_confirmed_at = null,
    confirmed_by = null,
    reminder_12h_sent_at = null,
    reminder_6h_sent_at = null,
    no_confirm_alert_sent_at = null,
    no_confirm_second_alert_sent_at = null,
    guardian_arranging_sent_at = null
  where id = req.id;

  perform public.invalidate_assignment_tokens(req.id, released_helper_id);

  return jsonb_build_object(
    'ok', true,
    'code', 'released',
    'request_id', req.id,
    'helper_id', released_helper_id,
    'reason', p_reason
  );
end;
$$;

revoke all on function public.release_assigned_helper(uuid, text, uuid) from public;
revoke all on function public.release_assigned_helper(uuid, text, uuid) from anon;
revoke all on function public.release_assigned_helper(uuid, text, uuid) from authenticated;
grant execute on function public.release_assigned_helper(uuid, text, uuid) to postgres;
grant execute on function public.release_assigned_helper(uuid, text, uuid) to service_role;

create or replace function public.helper_cant_make_it(
  p_token_hash text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.assignment_tokens%rowtype;
  released jsonb;
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'Invalid link.');
  end if;

  select *
    into token_row
  from public.assignment_tokens
  where token_hash = p_token_hash
  for update;

  if not found or token_row.invalidated_at is not null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'This link is no longer valid.');
  end if;

  released := public.release_assigned_helper(
    token_row.request_id,
    'helper_dropped',
    token_row.helper_id
  );

  if coalesce((released ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(released ->> 'code', 'release_failed'),
      'message', coalesce(released ->> 'message', 'Unable to process this request.')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'dropped',
    'message', 'Thanks for letting us know. We''ll arrange a replacement.',
    'request_id', token_row.request_id,
    'helper_id', token_row.helper_id,
    'dropout_reason', nullif(trim(coalesce(p_reason, '')), '')
  );
end;
$$;

revoke all on function public.helper_cant_make_it(text, text) from public;
revoke all on function public.helper_cant_make_it(text, text) from anon;
revoke all on function public.helper_cant_make_it(text, text) from authenticated;
grant execute on function public.helper_cant_make_it(text, text) to postgres;
grant execute on function public.helper_cant_make_it(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Senior confirms by phone (no emails)
-- ---------------------------------------------------------------------------
create or replace function public.senior_confirm_helper(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.consultation_requests%rowtype;
begin
  select *
    into req
  from public.consultation_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;

  if req.status <> 'assigned' or req.assigned_helper_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_assigned', 'message', 'Request is not assigned.');
  end if;

  if req.helper_confirmed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_confirmed',
      'message', 'Helper was already confirmed.',
      'confirmed_by', req.confirmed_by
    );
  end if;

  update public.consultation_requests
  set
    helper_confirmed_at = now(),
    confirmed_by = 'senior'
  where id = req.id;

  return jsonb_build_object(
    'ok', true,
    'code', 'confirmed',
    'message', 'Marked helper as confirmed by phone.',
    'request_id', req.id,
    'helper_id', req.assigned_helper_id
  );
end;
$$;

revoke all on function public.senior_confirm_helper(uuid) from public;
revoke all on function public.senior_confirm_helper(uuid) from anon;
revoke all on function public.senior_confirm_helper(uuid) from authenticated;
grant execute on function public.senior_confirm_helper(uuid) to postgres;
grant execute on function public.senior_confirm_helper(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- create_senior_offer: block previous_helper_ids; expose urgent flag
-- ---------------------------------------------------------------------------
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
begin
  if p_token_hash is null or length(trim(p_token_hash)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select * into req
  from public.consultation_requests
  where id = p_request_id
  for update;

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

  select * into helper_row
  from public.helpers
  where id = p_helper_id;

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
      ) < 3 * 3600
  ) into engaged;

  if engaged then
    return jsonb_build_object(
      'ok', false,
      'code', 'helper_busy',
      'message', 'Helper is busy near this appointment time.'
    );
  end if;

  update public.helper_offers
  set
    status = 'expired',
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
    request_id,
    helper_id,
    wave_number,
    status,
    token_hash,
    distance_km,
    source,
    sent_at,
    responded_at
  )
  values (
    p_request_id,
    p_helper_id,
    greatest(next_wave, 1),
    'sent',
    p_token_hash,
    p_distance_km,
    'senior',
    now(),
    null
  )
  on conflict (request_id, helper_id) do update
  set
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
  expiry_minutes := case when hours_to_appt < 3 then 15 else 60 end;

  return jsonb_build_object(
    'ok', true,
    'code', 'offered',
    'offer_id', offer_id,
    'wave_number', greatest(next_wave, 1),
    'helper_id', p_helper_id,
    'request_id', p_request_id,
    'expiry_minutes', expiry_minutes,
    'urgent', hours_to_appt < 3
  );
end;
$$;

revoke all on function public.create_senior_offer(uuid, uuid, text, double precision) from public;
revoke all on function public.create_senior_offer(uuid, uuid, text, double precision) from anon;
revoke all on function public.create_senior_offer(uuid, uuid, text, double precision) from authenticated;
grant execute on function public.create_senior_offer(uuid, uuid, text, double precision) to postgres;
grant execute on function public.create_senior_offer(uuid, uuid, text, double precision) to service_role;

-- ---------------------------------------------------------------------------
-- List helpers: include dropped_before; block re-select
-- ---------------------------------------------------------------------------
create or replace function public.list_helpers_for_senior(p_request_id uuid)
returns table (
  helper_id uuid,
  full_name text,
  gender text,
  home_area text,
  home_pincode text,
  email text,
  phone text,
  max_travel_km double precision,
  distance_km double precision,
  within_range boolean,
  gender_match boolean,
  declined_before boolean,
  dropped_before boolean,
  is_busy boolean,
  busy_at time,
  upcoming_assigned_jobs bigint,
  sort_gender_match integer,
  sort_within_range integer
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

  appt := public.appointment_timestamptz(req.appointment_date, req.appointment_time);

  return query
  with scored as (
    select
      h.id as helper_id,
      h.full_name,
      h.gender,
      h.home_area,
      h.home_pincode,
      h.email,
      h.phone,
      h.max_travel_km::double precision as max_travel_km,
      case
        when req.latitude is null or req.longitude is null
          or h.latitude is null or h.longitude is null
          or req.location_missing or h.location_missing
        then null
        else public.distance_km(req.latitude, req.longitude, h.latitude, h.longitude)
      end as distance_km,
      (
        req.helper_preference = 'any'
        or h.gender = req.helper_preference
      ) as gender_match,
      exists (
        select 1
        from public.helper_offers ho
        where ho.request_id = p_request_id
          and ho.helper_id = h.id
          and ho.status = 'declined'
      ) as declined_before,
      (h.id = any (coalesce(req.previous_helper_ids, '{}'::uuid[]))) as dropped_before,
      (
        select engaged.appointment_time
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
        order by engaged.appointment_time
        limit 1
      ) as busy_at,
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
  )
  select
    s.helper_id,
    s.full_name,
    s.gender,
    s.home_area,
    s.home_pincode,
    s.email,
    s.phone,
    s.max_travel_km,
    s.distance_km,
    (
      s.distance_km is not null
      and s.distance_km <= s.max_travel_km
    ) as within_range,
    s.gender_match,
    s.declined_before,
    s.dropped_before,
    (s.busy_at is not null) as is_busy,
    s.busy_at,
    s.upcoming_assigned_jobs,
    case when s.gender_match then 0 else 1 end as sort_gender_match,
    case
      when s.distance_km is not null and s.distance_km <= s.max_travel_km then 0
      else 1
    end as sort_within_range
  from scored s
  order by
    case when s.dropped_before then 1 else 0 end asc,
    sort_gender_match asc,
    sort_within_range asc,
    s.distance_km asc nulls last,
    s.upcoming_assigned_jobs asc,
    s.full_name asc;
end;
$$;

revoke all on function public.list_helpers_for_senior(uuid) from public;
revoke all on function public.list_helpers_for_senior(uuid) from anon;
revoke all on function public.list_helpers_for_senior(uuid) from authenticated;
grant execute on function public.list_helpers_for_senior(uuid) to postgres;
grant execute on function public.list_helpers_for_senior(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: helper-reminders every 15 minutes
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'helper-reminders-every-15-min') then
    perform cron.unschedule(
      (select jobid from cron.job where jobname = 'helper-reminders-every-15-min' limit 1)
    );
  end if;
exception
  when undefined_table then
    null;
  when undefined_function then
    null;
end;
$$;

select cron.schedule(
  'helper-reminders-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/helper-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
    ),
    body := jsonb_build_object('reason', 'cron'),
    timeout_milliseconds := 20000
  );
  $$
);

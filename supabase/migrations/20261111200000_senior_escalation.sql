-- Feature 6: senior escalation and manual assignment
-- All wall-clock logic uses Asia/Kolkata.

-- ---------------------------------------------------------------------------
-- consultation_requests: senior_offered + notification timestamps
-- ---------------------------------------------------------------------------
alter table public.consultation_requests
  add column if not exists senior_notified_at timestamptz,
  add column if not exists guardian_arranging_sent_at timestamptz;

alter table public.consultation_requests
  drop constraint if exists consultation_requests_status_check;

alter table public.consultation_requests
  add constraint consultation_requests_status_check
  check (
    status in (
      'new',
      'offered',
      'senior_offered',
      'assigned',
      'needs_senior',
      'cancelled',
      'completed'
    )
  );

comment on column public.consultation_requests.status is
  'Request lifecycle: new, offered, senior_offered, assigned, needs_senior, cancelled, completed';
comment on column public.consultation_requests.senior_notified_at is
  'When the urgent short_notice senior email was sent';
comment on column public.consultation_requests.guardian_arranging_sent_at is
  'When the one-time guardian reassurance email was sent for needs_senior';

-- ---------------------------------------------------------------------------
-- helper_offers.source: wave (default) or senior
-- ---------------------------------------------------------------------------
alter table public.helper_offers
  add column if not exists source text not null default 'wave';

alter table public.helper_offers
  drop constraint if exists helper_offers_source_check;

alter table public.helper_offers
  add constraint helper_offers_source_check
  check (source in ('wave', 'senior'));

comment on column public.helper_offers.source is
  'How the offer was created: automatic wave or senior manual assignment';

-- ---------------------------------------------------------------------------
-- App secrets helper (vault fallback when edge env secrets are unset)
-- ---------------------------------------------------------------------------
create or replace function public.get_app_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_value text;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    return null;
  end if;

  select ds.decrypted_secret
    into secret_value
  from vault.decrypted_secrets ds
  where ds.name = p_name
  limit 1;

  return secret_value;
end;
$$;

revoke all on function public.get_app_secret(text) from public;
revoke all on function public.get_app_secret(text) from anon;
revoke all on function public.get_app_secret(text) from authenticated;
grant execute on function public.get_app_secret(text) to postgres;
grant execute on function public.get_app_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- HTTP enqueue helper for senior-notify
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_senior_notify(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  perform net.http_post(
    url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/senior-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
    ),
    body := jsonb_build_object(
      'request_id', p_request_id,
      'reason', 'status_needs_senior'
    ),
    timeout_milliseconds := 8000
  );
end;
$$;

revoke all on function public.enqueue_senior_notify(uuid) from public;
revoke all on function public.enqueue_senior_notify(uuid) from anon;
revoke all on function public.enqueue_senior_notify(uuid) from authenticated;
grant execute on function public.enqueue_senior_notify(uuid) to postgres;
grant execute on function public.enqueue_senior_notify(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- mark_request_needs_senior: also from senior_offered; fire notify hook
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
declare
  updated_id uuid;
begin
  update public.consultation_requests
  set
    status = 'needs_senior',
    needs_senior_reason = coalesce(p_reason, needs_senior_reason)
  where id = p_request_id
    and status in ('offered', 'senior_offered')
  returning id into updated_id;

  update public.helper_offers
  set
    status = 'expired',
    responded_at = coalesce(responded_at, now())
  where request_id = p_request_id
    and status = 'sent';

  -- Trigger notification edge function when status actually changed
  if updated_id is not null then
    perform public.enqueue_senior_notify(updated_id);
  end if;
end;
$$;

revoke all on function public.mark_request_needs_senior(uuid, text) from public;
revoke all on function public.mark_request_needs_senior(uuid, text) from anon;
revoke all on function public.mark_request_needs_senior(uuid, text) from authenticated;
grant execute on function public.mark_request_needs_senior(uuid, text) to postgres;
grant execute on function public.mark_request_needs_senior(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- AFTER INSERT: short_notice already set → notify senior + guardian
-- ---------------------------------------------------------------------------
create or replace function public.consultation_request_notify_needs_senior()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'needs_senior' then
    perform public.enqueue_senior_notify(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists consultation_requests_notify_needs_senior on public.consultation_requests;

create trigger consultation_requests_notify_needs_senior
  after insert on public.consultation_requests
  for each row
  execute function public.consultation_request_notify_needs_senior();

revoke all on function public.consultation_request_notify_needs_senior() from public;
revoke all on function public.consultation_request_notify_needs_senior() from anon;
revoke all on function public.consultation_request_notify_needs_senior() from authenticated;
grant execute on function public.consultation_request_notify_needs_senior() to postgres;
grant execute on function public.consultation_request_notify_needs_senior() to service_role;

-- ---------------------------------------------------------------------------
-- Accept offer: allow senior_offered as well as offered
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
    'helper_id', offer_row.helper_id,
    'source', offer_row.source
  );
end;
$$;

revoke all on function public.accept_helper_offer(text) from public;
revoke all on function public.accept_helper_offer(text) from anon;
revoke all on function public.accept_helper_offer(text) from authenticated;
grant execute on function public.accept_helper_offer(text) to postgres;
grant execute on function public.accept_helper_offer(text) to service_role;

-- ---------------------------------------------------------------------------
-- Decline offer: senior source → back to needs_senior
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
  new_status text;
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

  new_status := req.status;

  if offer_row.source = 'senior' and req.status = 'senior_offered' then
    update public.consultation_requests
    set status = 'needs_senior'
    where id = req.id;
    new_status := 'needs_senior';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'declined',
    'message', 'Thanks, noted.',
    'request_id', req.id,
    'helper_id', offer_row.helper_id,
    'wave_number', offer_row.wave_number,
    'request_status', new_status,
    'source', offer_row.source,
    'helper_name', (select h.full_name from public.helpers h where h.id = offer_row.helper_id)
  );
end;
$$;

revoke all on function public.decline_helper_offer(text) from public;
revoke all on function public.decline_helper_offer(text) from anon;
revoke all on function public.decline_helper_offer(text) from authenticated;
grant execute on function public.decline_helper_offer(text) to postgres;
grant execute on function public.decline_helper_offer(text) to service_role;

-- ---------------------------------------------------------------------------
-- Expire a senior offer (1-hour timeout) and return to needs_senior
-- ---------------------------------------------------------------------------
create or replace function public.expire_senior_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.helper_offers%rowtype;
  req public.consultation_requests%rowtype;
  helper_name text;
begin
  select *
    into offer_row
  from public.helper_offers
  where id = p_offer_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if offer_row.source <> 'senior' or offer_row.status <> 'sent' then
    return jsonb_build_object('ok', false, 'code', 'not_expirable');
  end if;

  select *
    into req
  from public.consultation_requests
  where id = offer_row.request_id
  for update;

  update public.helper_offers
  set
    status = 'expired',
    responded_at = coalesce(responded_at, now())
  where id = offer_row.id;

  if req.status = 'senior_offered' then
    update public.consultation_requests
    set status = 'needs_senior'
    where id = req.id;
  end if;

  select h.full_name into helper_name
  from public.helpers h
  where h.id = offer_row.helper_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'expired',
    'request_id', offer_row.request_id,
    'helper_id', offer_row.helper_id,
    'helper_name', helper_name
  );
end;
$$;

revoke all on function public.expire_senior_offer(uuid) from public;
revoke all on function public.expire_senior_offer(uuid) from anon;
revoke all on function public.expire_senior_offer(uuid) from authenticated;
grant execute on function public.expire_senior_offer(uuid) to postgres;
grant execute on function public.expire_senior_offer(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- List ALL active helpers for senior assignment UI (with match signals)
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
-- Create / refresh a senior offer for a helper (upsert on unique pair)
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

  -- Expire any other open senior offers on this request
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

  return jsonb_build_object(
    'ok', true,
    'code', 'offered',
    'offer_id', offer_id,
    'wave_number', greatest(next_wave, 1),
    'helper_id', p_helper_id,
    'request_id', p_request_id
  );
end;
$$;

revoke all on function public.create_senior_offer(uuid, uuid, text, double precision) from public;
revoke all on function public.create_senior_offer(uuid, uuid, text, double precision) from anon;
revoke all on function public.create_senior_offer(uuid, uuid, text, double precision) from authenticated;
grant execute on function public.create_senior_offer(uuid, uuid, text, double precision) to postgres;
grant execute on function public.create_senior_offer(uuid, uuid, text, double precision) to service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: senior-digest at 10:00, 13:00, 16:00, 19:00 Asia/Kolkata
-- (= 04:30, 07:30, 10:30, 13:30 UTC)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'senior-digest-ist') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'senior-digest-ist' limit 1));
  end if;
exception
  when undefined_table then
    null;
  when undefined_function then
    null;
end;
$$;

select cron.schedule(
  'senior-digest-ist',
  '30 4,7,10,13 * * *',
  $$
  select net.http_post(
    url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/senior-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
    ),
    body := jsonb_build_object('reason', 'cron'),
    timeout_milliseconds := 15000
  );
  $$
);

-- Feature 9: helper verification fields, storage, suitable-helper gates,
-- DL expiry cron, helper_unavailable drop-out reason.
-- All wall-clock logic uses Asia/Kolkata.

-- ---------------------------------------------------------------------------
-- helpers: verification & driving columns
-- ---------------------------------------------------------------------------
alter table public.helpers
  add column if not exists can_drive boolean not null default false,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists aadhaar_qr_verified boolean not null default false,
  add column if not exists aadhaar_last4 text,
  add column if not exists aadhaar_verified_at timestamptz,
  add column if not exists aadhaar_verified_by uuid references auth.users (id) on delete set null,
  add column if not exists second_id_type text,
  add column if not exists second_id_last4 text,
  add column if not exists dl_last4 text,
  add column if not exists dl_expiry date,
  add column if not exists bg_check_method text,
  add column if not exists bg_check_reference text,
  add column if not exists bg_check_notes text,
  add column if not exists bg_check_date date,
  add column if not exists photo_path text,
  add column if not exists photo_status text not null default 'none',
  add column if not exists references_checked boolean not null default false,
  add column if not exists references_notes text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users (id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists dl_warn_30_sent_at timestamptz,
  add column if not exists dl_warn_7_sent_at timestamptz,
  add column if not exists dl_expired_notified_at timestamptz;

alter table public.helpers
  drop constraint if exists helpers_verification_status_check;
alter table public.helpers
  add constraint helpers_verification_status_check
  check (verification_status in ('pending', 'verified', 'rejected', 'expired'));

alter table public.helpers
  drop constraint if exists helpers_aadhaar_last4_check;
alter table public.helpers
  add constraint helpers_aadhaar_last4_check
  check (aadhaar_last4 is null or aadhaar_last4 ~ '^\d{4}$');

alter table public.helpers
  drop constraint if exists helpers_second_id_type_check;
alter table public.helpers
  add constraint helpers_second_id_type_check
  check (
    second_id_type is null
    or second_id_type in ('pan', 'voter_id', 'passport', 'driving_licence')
  );

alter table public.helpers
  drop constraint if exists helpers_second_id_last4_check;
alter table public.helpers
  add constraint helpers_second_id_last4_check
  check (second_id_last4 is null or second_id_last4 ~ '^\d{4}$');

alter table public.helpers
  drop constraint if exists helpers_dl_last4_check;
alter table public.helpers
  add constraint helpers_dl_last4_check
  check (dl_last4 is null or dl_last4 ~ '^\d{4}$');

alter table public.helpers
  drop constraint if exists helpers_bg_check_method_check;
alter table public.helpers
  add constraint helpers_bg_check_method_check
  check (
    bg_check_method is null
    or bg_check_method in ('police_certificate', 'vendor', 'in_house')
  );

alter table public.helpers
  drop constraint if exists helpers_photo_status_check;
alter table public.helpers
  add constraint helpers_photo_status_check
  check (photo_status in ('none', 'pending', 'approved', 'rejected'));

-- Drivers must use driving licence as the additional ID when both are set
alter table public.helpers
  drop constraint if exists helpers_driver_requires_dl_check;
alter table public.helpers
  add constraint helpers_driver_requires_dl_check
  check (
    can_drive = false
    or second_id_type is null
    or second_id_type = 'driving_licence'
  );

create index if not exists helpers_verification_status_idx
  on public.helpers (verification_status);
create index if not exists helpers_is_active_idx
  on public.helpers (is_active);
create index if not exists helpers_home_area_idx
  on public.helpers (home_area);
create index if not exists helpers_dl_expiry_idx
  on public.helpers (dl_expiry)
  where can_drive = true;

comment on column public.helpers.aadhaar_last4 is
  'Last 4 digits of Aadhaar only. Never store full Aadhaar or Aadhaar images.';
comment on column public.helpers.verification_status is
  'pending | verified | rejected | expired (DL expiry for drivers)';
comment on column public.helpers.photo_path is
  'Object path in private helper-photos storage bucket';

-- Also fill city from pincode district when blank
create or replace function public.fill_helper_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pin_lat double precision;
  pin_lng double precision;
  pin_district text;
  pin_area text;
begin
  if new.home_pincode is null or new.home_pincode = '' then
    new.latitude := null;
    new.longitude := null;
    new.location_missing := true;
    return new;
  end if;

  select p.latitude, p.longitude, p.district, p.area_name
    into pin_lat, pin_lng, pin_district, pin_area
  from public.pincodes p
  where p.pincode = new.home_pincode;

  if found and pin_lat is not null and pin_lng is not null then
    new.latitude := pin_lat;
    new.longitude := pin_lng;
    new.location_missing := false;
    if new.city is null or btrim(new.city) = '' then
      new.city := coalesce(nullif(btrim(pin_district), ''), 'Chennai');
    end if;
    if new.home_area is null or btrim(new.home_area) = '' then
      new.home_area := pin_area;
    end if;
  else
    new.latitude := null;
    new.longitude := null;
    new.location_missing := true;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- needs_senior_reason: helper_unavailable
-- ---------------------------------------------------------------------------
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
      'helper_not_confirmed',
      'helper_unavailable'
    )
  );

-- ---------------------------------------------------------------------------
-- release_assigned_helper: allow helper_unavailable
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
  if p_reason is null
     or p_reason not in ('helper_dropped', 'helper_not_confirmed', 'helper_unavailable') then
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

-- ---------------------------------------------------------------------------
-- Withdraw open offers for a helper + list/release upcoming assigned jobs
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_helper_open_offers(p_helper_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  withdrawn_count integer := 0;
begin
  update public.helper_offers
  set
    status = 'withdrawn',
    responded_at = coalesce(responded_at, now())
  where helper_id = p_helper_id
    and status = 'sent';

  get diagnostics withdrawn_count = row_count;
  return withdrawn_count;
end;
$$;

revoke all on function public.withdraw_helper_open_offers(uuid) from public;
revoke all on function public.withdraw_helper_open_offers(uuid) from anon;
revoke all on function public.withdraw_helper_open_offers(uuid) from authenticated;
grant execute on function public.withdraw_helper_open_offers(uuid) to service_role;

create or replace function public.list_helper_upcoming_assigned_jobs(p_helper_id uuid)
returns table (
  request_id uuid,
  parent_name text,
  appointment_date date,
  appointment_time time,
  doctor_hospital text,
  area text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cr.id as request_id,
    cr.parent_name,
    cr.appointment_date,
    cr.appointment_time,
    cr.doctor_hospital,
    cr.area,
    cr.status
  from public.consultation_requests cr
  where cr.assigned_helper_id = p_helper_id
    and cr.status = 'assigned'
    and public.appointment_timestamptz(cr.appointment_date, cr.appointment_time) >= now()
  order by cr.appointment_date, cr.appointment_time;
$$;

revoke all on function public.list_helper_upcoming_assigned_jobs(uuid) from public;
revoke all on function public.list_helper_upcoming_assigned_jobs(uuid) from anon;
revoke all on function public.list_helper_upcoming_assigned_jobs(uuid) from authenticated;
grant execute on function public.list_helper_upcoming_assigned_jobs(uuid) to service_role;
grant execute on function public.list_helper_upcoming_assigned_jobs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- find_suitable_helpers: only active + verified
-- ---------------------------------------------------------------------------
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
      and h.verification_status = 'verified'
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

-- ---------------------------------------------------------------------------
-- list_helpers_for_senior: include verification; unverified stay listed
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
  verification_status text,
  is_verified boolean,
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
  engaged_secs integer := public.engaged_window_seconds();
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
      h.verification_status,
      (h.verification_status = 'verified') as is_verified,
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
          ) < engaged_secs
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
    s.verification_status,
    s.is_verified,
    case when s.gender_match then 0 else 1 end as sort_gender_match,
    case
      when s.distance_km is not null and s.distance_km <= s.max_travel_km then 0
      else 1
    end as sort_within_range
  from scored s
  order by
    case when s.is_verified then 0 else 1 end asc,
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
grant execute on function public.list_helpers_for_senior(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_senior_offer: require verified + active
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
  if not found
     or helper_row.is_active is not true
     or helper_row.verification_status is distinct from 'verified' then
    return jsonb_build_object(
      'ok', false,
      'code', 'helper_not_verified',
      'message', 'Only verified active helpers can receive offers.'
    );
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

-- ---------------------------------------------------------------------------
-- Private storage bucket: helper-photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'helper-photos',
  'helper-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No direct client policies: uploads/reads go through service-role edge functions.
drop policy if exists helper_photos_no_anon on storage.objects;
drop policy if exists helper_photos_no_authenticated on storage.objects;

-- ---------------------------------------------------------------------------
-- Seed sample helpers as verified (TEST HELPER)
-- ---------------------------------------------------------------------------
update public.helpers
set
  can_drive = (gender = 'male'),
  verification_status = 'verified',
  aadhaar_qr_verified = true,
  aadhaar_last4 = '0000',
  aadhaar_verified_at = now(),
  second_id_type = case when gender = 'male' then 'driving_licence' else 'pan' end,
  second_id_last4 = '0000',
  dl_last4 = case when gender = 'male' then '0000' else null end,
  dl_expiry = case
    when gender = 'male' then ((now() at time zone 'Asia/Kolkata')::date + 365)
    else null
  end,
  bg_check_method = 'in_house',
  bg_check_reference = 'TEST-BG-001',
  bg_check_notes = 'TEST HELPER',
  bg_check_date = (now() at time zone 'Asia/Kolkata')::date,
  photo_path = 'placeholders/' || id::text || '.png',
  photo_status = 'approved',
  references_checked = true,
  references_notes = 'TEST HELPER',
  verified_at = now(),
  notes = 'TEST HELPER',
  rejection_reason = null
where notes is distinct from 'do-not-seed'
  and email like 'nandhu17223+helper%@gmail.com';

-- ---------------------------------------------------------------------------
-- pg_cron: helper-dl-expiry daily at 07:30 Asia/Kolkata (= 02:00 UTC)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'helper-dl-expiry-0730-ist') then
    perform cron.unschedule(
      (select jobid from cron.job where jobname = 'helper-dl-expiry-0730-ist' limit 1)
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
  'helper-dl-expiry-0730-ist',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/helper-dl-expiry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
    ),
    body := jsonb_build_object('reason', 'cron'),
    timeout_milliseconds := 30000
  );
  $$
);

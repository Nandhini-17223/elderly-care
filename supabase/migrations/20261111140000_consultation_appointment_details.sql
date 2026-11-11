-- Appointment details for consultation requests + IST past-time guard

alter table public.consultation_requests
  add column if not exists appointment_date date,
  add column if not exists appointment_time time,
  add column if not exists doctor_hospital text,
  add column if not exists helper_preference text;

-- Backfill existing rows so NOT NULL can be applied safely
update public.consultation_requests
set
  appointment_date = coalesce(
    appointment_date,
    ((now() at time zone 'Asia/Kolkata')::date + 1)
  ),
  appointment_time = coalesce(appointment_time, time '10:00'),
  doctor_hospital = coalesce(nullif(doctor_hospital, ''), 'Not specified'),
  helper_preference = coalesce(helper_preference, 'any')
where
  appointment_date is null
  or appointment_time is null
  or doctor_hospital is null
  or doctor_hospital = ''
  or helper_preference is null;

alter table public.consultation_requests
  alter column appointment_date set not null,
  alter column appointment_time set not null,
  alter column doctor_hospital set not null,
  alter column helper_preference set not null;

alter table public.consultation_requests
  drop constraint if exists consultation_requests_helper_preference_check;

alter table public.consultation_requests
  add constraint consultation_requests_helper_preference_check
  check (helper_preference in ('female', 'male', 'any'));

comment on column public.consultation_requests.appointment_date is
  'Requested appointment date (interpreted in Asia/Kolkata)';
comment on column public.consultation_requests.appointment_time is
  'Requested appointment time (interpreted in Asia/Kolkata)';
comment on column public.consultation_requests.doctor_hospital is
  'Doctor or hospital name for the appointment';
comment on column public.consultation_requests.helper_preference is
  'Preferred helper gender: female, male, or any';

create or replace function public.reject_past_consultation_appointment()
returns trigger
language plpgsql
as $$
declare
  appointment_local timestamp;
  now_local timestamp;
begin
  if new.appointment_date is null or new.appointment_time is null then
    raise exception 'Appointment date and time are required'
      using errcode = 'check_violation';
  end if;

  appointment_local := (new.appointment_date + new.appointment_time);
  now_local := (now() at time zone 'Asia/Kolkata');

  if appointment_local < now_local then
    raise exception
      'Appointment date/time cannot be in the past (Asia/Kolkata). Please choose a future appointment.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists consultation_requests_reject_past_appointment
  on public.consultation_requests;

create trigger consultation_requests_reject_past_appointment
  before insert on public.consultation_requests
  for each row
  execute function public.reject_past_consultation_appointment();

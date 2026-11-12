DROP FUNCTION IF EXISTS public.list_helper_upcoming_assigned_jobs(uuid);

CREATE OR REPLACE FUNCTION public.list_helper_upcoming_assigned_jobs(p_helper_id uuid)
RETURNS TABLE(
  request_id uuid,
  ref_number text,
  parent_name text,
  appointment_date date,
  appointment_time time without time zone,
  doctor_hospital text,
  area text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cr.id, cr.ref_number, cr.parent_name, cr.appointment_date, cr.appointment_time,
         cr.doctor_hospital, cr.area, cr.status
  FROM public.consultation_requests cr
  WHERE cr.assigned_helper_id = p_helper_id
    AND cr.status = 'assigned'
    AND public.appointment_timestamptz(cr.appointment_date, cr.appointment_time) >= now()
  ORDER BY cr.appointment_date, cr.appointment_time;
$function$;

GRANT EXECUTE ON FUNCTION public.list_helper_upcoming_assigned_jobs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_helper_upcoming_assigned_jobs(uuid) TO authenticated;

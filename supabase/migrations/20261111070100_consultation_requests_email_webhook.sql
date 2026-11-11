-- Trigger Edge Function on every new consultation request via pg_net
create or replace function public.notify_consultation_request()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  perform net.http_post(
    url := 'https://vzmhcqhcvflylmobpvap.supabase.co/functions/v1/send-consultation-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', null
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$$;

revoke all on function public.notify_consultation_request() from public;
revoke all on function public.notify_consultation_request() from anon;
revoke all on function public.notify_consultation_request() from authenticated;
grant execute on function public.notify_consultation_request() to postgres;
grant execute on function public.notify_consultation_request() to service_role;

drop trigger if exists consultation_requests_send_email on public.consultation_requests;

create trigger consultation_requests_send_email
  after insert on public.consultation_requests
  for each row
  execute function public.notify_consultation_request();

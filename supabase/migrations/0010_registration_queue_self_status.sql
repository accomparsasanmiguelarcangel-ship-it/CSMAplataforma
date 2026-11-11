-- Permite que cada solicitante consulte únicamente su propio turno de correo.
create or replace function public.get_registration_queue_status(p_user_id uuid, p_email text)
returns table (queue_no bigint, scheduled_at timestamptz, status text)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select q.queue_no, q.scheduled_at, q.status
  from public.registration_email_queue q
  join auth.users u on u.id = q.user_id
  where q.user_id = p_user_id
    and lower(u.email) = lower(p_email)
  limit 1;
$$;
revoke all on function public.get_registration_queue_status(uuid,text) from public;
grant execute on function public.get_registration_queue_status(uuid,text) to anon, authenticated;

-- Serializa la reclamación y limita también los envíos realmente completados por hora.
create or replace function public.claim_next_registration_email()
returns setof public.registration_email_queue
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_sent_this_hour integer;
  v_hour_start timestamptz := date_trunc('hour', now());
begin
  -- Evita que dos workers reclamen dos turnos distintos al mismo tiempo.
  perform pg_advisory_xact_lock(hashtext('csma-registration-email-worker'));

  -- Recupera una tarea cuyo worker se haya detenido inesperadamente.
  update public.registration_email_queue
  set status = 'pending',
      scheduled_at = greatest(scheduled_at, now()),
      last_error = coalesce(last_error, 'El proceso anterior se interrumpió; se reintentará.'),
      updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '10 minutes';

  -- Si otro worker sigue enviando, conserva el orden y espera.
  if exists (
    select 1 from public.registration_email_queue where status = 'sending'
  ) then
    return;
  end if;

  select count(*) into v_sent_this_hour
  from public.registration_email_queue
  where sent_at >= v_hour_start
    and sent_at < v_hour_start + interval '1 hour'
    and status in ('sent', 'confirmed');

  select id into v_id
  from public.registration_email_queue
  where status in ('pending', 'failed')
  order by queue_no
  limit 1
  for update;

  if v_id is null then return; end if;

  -- No supera dos correos realmente enviados en la hora de reloj.
  if v_sent_this_hour >= 2 then
    update public.registration_email_queue
    set scheduled_at = greatest(scheduled_at, v_hour_start + interval '1 hour'),
        updated_at = now()
    where id = v_id;
    return;
  end if;

  if not exists (
    select 1 from public.registration_email_queue
    where id = v_id and scheduled_at <= now()
  ) then
    return;
  end if;

  return query
  update public.registration_email_queue
  set status = 'sending', attempts = attempts + 1, updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_next_registration_email() from public, anon, authenticated;
grant execute on function public.claim_next_registration_email() to service_role;

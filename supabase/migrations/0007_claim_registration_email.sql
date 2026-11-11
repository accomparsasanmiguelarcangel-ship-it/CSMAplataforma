-- Claim atómico: el worker solo procesa el primer correo pendiente y nunca adelanta turnos.
create or replace function public.claim_next_registration_email()
returns setof public.registration_email_queue
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if exists (select 1 from public.registration_email_queue where status = 'sending') then
    return;
  end if;

  select id into v_id
  from public.registration_email_queue
  where status in ('pending','failed')
  order by queue_no
  limit 1
  for update;

  if v_id is null then return; end if;
  if not exists (
    select 1 from public.registration_email_queue
    where id = v_id and scheduled_at <= now()
  ) then return; end if;

  return query
  update public.registration_email_queue
  set status = 'sending', attempts = attempts + 1, updated_at = now()
  where id = v_id
  returning *;
end;
$$;
revoke all on function public.claim_next_registration_email() from public, anon, authenticated;
grant execute on function public.claim_next_registration_email() to service_role;

-- Consumo atómico del enlace: aprobación manual y confirmación por correo no pueden competir.
create or replace function public.consume_registration_confirmation(p_token_hash text)
returns table (redirect_to text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_redirect text;
begin
  update public.registration_email_queue
  set status = 'confirmed',
      confirmation_token = '',
      updated_at = now()
  where confirmation_token_hash = p_token_hash
    and status in ('sending','sent')
    and expires_at > now()
  returning user_id, registration_email_queue.redirect_to
  into v_user_id, v_redirect;

  if v_user_id is null then return; end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;

  return query select v_redirect;
end;
$$;
revoke all on function public.consume_registration_confirmation(text) from public, anon, authenticated;
grant execute on function public.consume_registration_confirmation(text) to service_role;

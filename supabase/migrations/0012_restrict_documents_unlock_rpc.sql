-- Prevent callers from checking another participant's payment status through the RPC.
create or replace function public.docs_unlocked(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_id is null then false
    when p_id <> public.my_participant_id() and not public.is_staff() then false
    when not exists (
      select 1 from public.participants
      where id = p_id and status in ('inscrito','activo','observado')
    ) then false
    else public.participant_paid(p_id) > 0
  end;
$$;

revoke all on function public.docs_unlocked(uuid) from public;
revoke all on function public.docs_unlocked(uuid) from anon;
grant execute on function public.docs_unlocked(uuid) to authenticated;

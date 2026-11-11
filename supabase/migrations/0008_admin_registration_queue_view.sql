create or replace function public.admin_list_registration_email_queue()
returns table (
  queue_no bigint,
  user_id uuid,
  email text,
  scheduled_at timestamptz,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role app_role; v_active boolean;
begin
  select role, active into v_role, v_active
  from public.profiles where id = auth.uid();
  if coalesce(v_active,false) is not true or v_role not in ('admin','superadmin') then
    raise exception 'No tienes permisos para consultar la cola.';
  end if;
  return query
    select q.queue_no, q.user_id, q.email::text, q.scheduled_at, q.status, q.created_at
    from public.registration_email_queue q
    order by q.queue_no;
end;
$$;
revoke all on function public.admin_list_registration_email_queue() from public, anon;
grant execute on function public.admin_list_registration_email_queue() to authenticated;

-- Cola estricta de correos de confirmación para inscripciones públicas CSMA.
-- La cola conserva el turno original incluso si una persona recibe aprobación manual.

create table if not exists public.registration_email_queue (
  id uuid primary key default gen_random_uuid(),
  queue_no bigint generated always as identity unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  action_type text not null check (action_type = 'signup'),
  confirmation_token text not null,
  confirmation_token_hash text not null unique,
  expires_at timestamptz not null,
  redirect_to text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','confirmed','cancelled','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, action_type)
);

create index if not exists registration_email_queue_due_idx
  on public.registration_email_queue(status, scheduled_at, queue_no);
create index if not exists registration_email_queue_order_idx
  on public.registration_email_queue(queue_no);

alter table public.registration_email_queue enable row level security;
revoke all on public.registration_email_queue from anon, authenticated;
grant all on public.registration_email_queue to service_role;

-- Reserva el primer espacio disponible, máximo dos correos por hora de reloj.
-- Advisory lock evita que dos registros simultáneos obtengan el mismo espacio.
create or replace function public.enqueue_registration_confirmation(
  p_user_id uuid,
  p_email text,
  p_confirmation_token text,
  p_confirmation_token_hash text,
  p_redirect_to text,
  p_expires_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  slot_start timestamptz := date_trunc('hour', now());
  slot_count integer;
  result_time timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('csma-registration-email-queue'));
  if exists (
    select 1 from public.registration_email_queue
    where user_id = p_user_id and action_type = 'signup'
  ) then
    select scheduled_at into result_time
    from public.registration_email_queue
    where user_id = p_user_id and action_type = 'signup';
    return result_time;
  end if;

  loop
    select count(*) into slot_count
    from public.registration_email_queue
    where scheduled_at >= slot_start
      and scheduled_at < slot_start + interval '1 hour'
      and status <> 'cancelled';

    exit when slot_count < 2;
    slot_start := slot_start + interval '1 hour';
  end loop;

  result_time := greatest(now(), slot_start);
  insert into public.registration_email_queue
    (user_id, email, action_type, confirmation_token, confirmation_token_hash, redirect_to, expires_at, scheduled_at)
  values
    (p_user_id, p_email, 'signup', p_confirmation_token, p_confirmation_token_hash, p_redirect_to, p_expires_at, result_time);
  return result_time;
end;
$$;

revoke all on function public.enqueue_registration_confirmation(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_registration_confirmation(uuid,text,text,text,text,timestamptz) to service_role;

-- Aprobación manual: solo administradores autenticados. No mueve los turnos de nadie.
create or replace function public.admin_approve_registration(p_user_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin public.profiles%rowtype;
  v_participant_id uuid;
begin
  select * into v_admin from public.profiles where id = auth.uid();
  if v_admin.id is null or v_admin.active is not true
     or v_admin.role not in ('admin','superadmin') then
    raise exception 'No tienes permisos para aprobar inscripciones.';
  end if;

  select id into v_participant_id
  from public.participants where profile_id = p_user_id for update;
  if v_participant_id is null then
    raise exception 'No se encontró la ficha del participante.';
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = p_user_id;

  update public.profiles set active = true where id = p_user_id;
  update public.participants
  set status = 'activo',
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = v_participant_id;

  update public.registration_email_queue
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where user_id = p_user_id and status in ('pending','sending','failed','sent');

  insert into public.audit_log (actor_email, action, table_name, record_id, old_data, new_data)
  values (
    v_admin.email::text, 'registration.manual_approval', 'participants', v_participant_id::text,
    jsonb_build_object('status','pendiente','email_confirmation','pending'),
    jsonb_build_object('status','activo','email_confirmation','admin_approved','notes',p_notes)
  );
end;
$$;

revoke all on function public.admin_approve_registration(uuid,text) from public, anon;
grant execute on function public.admin_approve_registration(uuid,text) to authenticated;

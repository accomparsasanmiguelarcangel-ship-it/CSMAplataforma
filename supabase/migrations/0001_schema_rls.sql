-- ═══════════════════════════════════════════════════════════════════════════
--  ASOCIACIÓN CULTURAL COMPARSA SAN MIGUEL ARCÁNGEL 2004
--  Migración 0001 — Esquema, reglas de integridad, RLS y auditoría
--  Todas las reglas críticas viven aquí, no en el frontend.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── ENUMS ──────────────────────────────────────────────────────────────────
do $$ begin
  create type app_role as enum ('superadmin','admin','controlador','participante');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_status as enum ('pendiente','inscrito','observado','rechazado','activo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pendiente','validado','rechazado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum
    ('presente','tardanza','falta_justificada','falta_injustificada','permiso','retiro_anticipado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entry_kind as enum ('entrada','salida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_action as enum ('validado','rechazado','observado','reenvio_solicitado');
exception when duplicate_object then null; end $$;

-- ── PROFILES (1:1 con auth.users) ──────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null default '',
  role app_role not null default 'participante',
  active boolean not null default true,
  participant_id uuid,
  created_at timestamptz not null default now()
);

-- ── SETTINGS (fila única) ──────────────────────────────────────────────────
create table if not exists public.settings (
  id text primary key default 'global',
  association_name text not null default 'Asociación Cultural Comparsa San Miguel Arcángel 2004',
  code_prefix text not null default 'ASO',
  total_amount numeric(10,2) not null default 320,
  advance_amount numeric(10,2) not null default 120,
  installments int not null default 4 check (installments between 1 and 24),
  first_due_date date not null default current_date + 12,
  yape_number text not null default '',
  yape_holder text not null default '',
  yape_qr_url text,
  docs_require_payment boolean not null default true,
  drive_root_folder_id text,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values ('global') on conflict do nothing;

-- ── SECUENCIA DE CÓDIGOS (generada en la base de datos) ────────────────────
create sequence if not exists public.participant_code_seq start 1;

create or replace function public.next_participant_code()
returns text language plpgsql security definer as $$
declare
  prefix text;
  n bigint;
begin
  select code_prefix into prefix from public.settings where id = 'global';
  prefix := coalesce(prefix, 'ASO');
  n := nextval('public.participant_code_seq');
  return prefix || '-' || lpad(n::text, 4, '0');
end $$;

-- ── PARTICIPANTS ───────────────────────────────────────────────────────────
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  code text not null unique,
  dni char(8) not null,
  first_names text not null,
  last_names text not null,
  phone text not null,
  address text not null default '',
  group_name text not null default '',
  photo_drive_id text,
  photo_storage_path text,
  status enrollment_status not null default 'pendiente',
  qr_token text not null unique default encode(gen_random_bytes(16),'hex'),
  notes text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dni_only_digits check (dni ~ '^[0-9]{8}$'),
  constraint dni_unique unique (dni)          -- ← detección de duplicados en la BD
);
create index if not exists participants_status_idx on public.participants(status);
create index if not exists participants_group_idx on public.participants(group_name);
create index if not exists participants_search_idx
  on public.participants using gin (to_tsvector('spanish', first_names || ' ' || last_names));

-- Código automático si no se envía
create or replace function public.set_participant_code()
returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.next_participant_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_participant_code on public.participants;
create trigger trg_participant_code before insert on public.participants
for each row execute function public.set_participant_code();

-- ── PAGOS ──────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  seq int not null,
  amount numeric(10,2) not null check (amount > 0),
  operation_number text not null,
  method text not null default 'Yape',
  concept text not null default 'Cuota',
  paid_at timestamptz not null default now(),
  receipt_drive_id text,
  receipt_storage_path text,
  status payment_status not null default 'pendiente',
  notes text,
  reject_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint op_number_digits check (operation_number ~ '^[0-9A-Za-z-]{4,32}$'),
  constraint op_number_unique unique (operation_number),   -- ← pago duplicado
  constraint seq_unique unique (participant_id, seq)
);
create index if not exists payments_status_idx on public.payments(status);
create index if not exists payments_participant_idx on public.payments(participant_id);
create index if not exists payments_paid_at_idx on public.payments(paid_at);

-- Numeración correlativa por participante, calculada en la BD
create or replace function public.set_payment_seq()
returns trigger language plpgsql as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq),0) + 1 into new.seq
    from public.payments where participant_id = new.participant_id;
  end if;
  if new.receipt_drive_id is null then
    new.receipt_drive_id := (select code from public.participants where id = new.participant_id)
      || '_PAGO_' || lpad(new.seq::text, 2, '0') || '.jpg';
  end if;
  return new;
end $$;

drop trigger if exists trg_payment_seq on public.payments;
create trigger trg_payment_seq before insert on public.payments
for each row execute function public.set_payment_seq();

-- ── REVISIONES (append-only: histórico de validaciones) ────────────────────
create table if not exists public.payment_reviews (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  action review_action not null,
  previous_status payment_status,
  new_status payment_status,
  amount numeric(10,2),
  reviewer_id uuid references public.profiles(id),
  reviewer_email citext,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.stamp_review()
returns trigger language plpgsql security definer as $$
declare v_email citext;
begin
  select email into v_email from public.profiles where id = auth.uid();
  new.reviewer_id := auth.uid();
  new.reviewer_email := v_email;
  return new;
end $$;

drop trigger if exists trg_stamp_review on public.payment_reviews;
create trigger trg_stamp_review before insert on public.payment_reviews
for each row execute function public.stamp_review();

-- Los cambios de estado del pago NO pueden borrar su historial
create or replace function public.log_payment_change()
returns trigger language plpgsql security definer as $$
begin
  if new.status is distinct from old.status then
    insert into public.payment_reviews (payment_id, action, previous_status, new_status, amount, notes)
    values (
      new.id,
      case new.status when 'validado' then 'validado'::review_action
                      when 'rechazado' then 'rechazado'::review_action
                      else 'observado'::review_action end,
      old.status, new.status, new.amount, new.reject_reason
    );
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_log_payment_change on public.payments;
create trigger trg_log_payment_change before update on public.payments
for each row execute function public.log_payment_change();

-- ── EVENTOS Y JORNADAS ─────────────────────────────────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  place text default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  categories text[] not null default '{}',
  requires_payment boolean not null default false,
  min_paid_amount numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint event_dates check (ends_at >= starts_at)
);

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  session_date date not null,
  start_time time not null default '09:00',
  end_time time not null default '12:00',
  late_after time not null default '09:15',
  unique (event_id, name, session_date)
);

-- ── ASISTENCIA ─────────────────────────────────────────────────────────────
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  entry_type entry_kind not null default 'entrada',
  status attendance_status not null default 'presente',
  method text not null default 'qr' check (method in ('qr','manual')),
  notes text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  recorded_by_email citext
);

-- Una sola asistencia por participante/jornada/tipo (salvo faltas justificadas)
create unique index if not exists attendance_unique_entry
  on public.attendance (participant_id, session_id, entry_type)
  where status not in ('falta_justificada','falta_injustificada','permiso');

create or replace function public.stamp_attendance()
returns trigger language plpgsql security definer as $$
begin
  new.recorded_by := auth.uid();
  new.recorded_by_email := (select email from public.profiles where id = auth.uid());
  return new;
end $$;

drop trigger if exists trg_stamp_attendance on public.attendance;
create trigger trg_stamp_attendance before insert on public.attendance
for each row execute function public.stamp_attendance();

-- ── DOCUMENTOS ─────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Otros documentos',
  description text default '',
  drive_file_id text,
  file_url text,
  requires_payment boolean not null default true,
  published boolean not null default false,
  published_at timestamptz not null default now(),
  size_label text,
  created_by uuid references public.profiles(id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'todos' check (audience in ('todos','participantes','administracion')),
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'sistema',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx on public.notifications(profile_id, read);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key text not null unique,
  type text not null default 'text' check (type in ('text','number','select','date')),
  required boolean not null default false,
  options text[] not null default '{}',
  active boolean not null default true,
  position int not null default 0
);

-- Intentos con DNI duplicado (para revisión administrativa)
create table if not exists public.duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  dni char(8) not null,
  first_names text, last_names text, phone text,
  existing_code text,
  attempted_at timestamptz not null default now(),
  reviewed boolean not null default false
);

-- ── AUDITORÍA (solo inserción) ─────────────────────────────────────────────
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_email citext,
  action text not null,
  table_name text not null,
  record_id text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_log(created_at desc);

create or replace function public.write_audit()
returns trigger language plpgsql security definer as $$
declare v_email citext;
begin
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log (actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), coalesce(v_email,'sistema'), tg_op, tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, 'n/a'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['participants','payments','events','event_sessions','documents','announcements','profiles','settings']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
       for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  FUNCIONES DE APOYO PARA RLS
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.current_role()
returns app_role language sql stable security definer as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'participante'::app_role);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer as $$
  select public.current_role() in ('superadmin','admin');
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer as $$
  select public.current_role() = 'superadmin';
$$;

create or replace function public.is_controller()
returns boolean language sql stable security definer as $$
  select public.current_role() in ('superadmin','admin','controlador');
$$;

create or replace function public.my_participant_id()
returns uuid language sql stable security definer as $$
  select id from public.participants where profile_id = auth.uid() limit 1;
$$;

-- Saldo y habilitación de documentos calculados en el servidor
create or replace function public.participant_paid(p_id uuid)
returns numeric language sql stable security definer as $$
  select coalesce(sum(amount),0) from public.payments
  where participant_id = p_id and status = 'validado';
$$;

create or replace function public.docs_unlocked(p_id uuid)
returns boolean language sql stable security definer as $$
  select case
    when p_id is null then false
    when not exists (
      select 1 from public.participants
      where id = p_id and status in ('inscrito','activo','observado')
    ) then false
    when (select docs_require_payment from public.settings where id='global') is false then true
    else public.participant_paid(p_id) > 0
  end;
$$;

-- Verificación de ingreso a un evento según su requisito financiero
create or replace function public.can_enter_event(p_token text, p_event uuid)
returns table (allowed boolean, reason text, participant_id uuid)
language plpgsql stable security definer as $$
declare v_p public.participants; v_ev public.events; v_paid numeric;
begin
  select * into v_p from public.participants where qr_token = p_token;
  if not found then
    return query select false, 'Código QR no reconocido.'::text, null::uuid;
    return;
  end if;
  select * into v_ev from public.events where id = p_event;
  v_paid := public.participant_paid(v_p.id);
  if v_p.status <> 'activo' then
    return query select false, 'Inscripción en estado ' || v_p.status::text, v_p.id;
  elsif v_ev.requires_payment and v_paid < v_ev.min_paid_amount then
    return query select false, 'Requiere S/ ' || v_ev.min_paid_amount::text || ' validados', v_p.id;
  else
    return query select true, 'Habilitado para el ingreso.', v_p.id;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.profiles          enable row level security;
alter table public.settings          enable row level security;
alter table public.participants      enable row level security;
alter table public.payments          enable row level security;
alter table public.payment_reviews   enable row level security;
alter table public.events            enable row level security;
alter table public.event_sessions    enable row level security;
alter table public.attendance        enable row level security;
alter table public.documents         enable row level security;
alter table public.announcements     enable row level security;
alter table public.notifications     enable row level security;
alter table public.form_fields       enable row level security;
alter table public.audit_log         enable row level security;
alter table public.duplicate_flags   enable row level security;

-- profiles
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid() or public.is_staff());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid() or public.is_superadmin())
  with check (id = auth.uid() or public.is_superadmin());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all
  using (public.is_superadmin()) with check (public.is_superadmin());

-- settings: lectura general, escritura solo superadmin
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for update
  using (public.is_superadmin()) with check (public.is_superadmin());

-- participants
drop policy if exists participants_self_read on public.participants;
create policy participants_self_read on public.participants for select
  using (profile_id = auth.uid() or public.is_controller());
drop policy if exists participants_self_insert on public.participants;
create policy participants_self_insert on public.participants for insert
  with check (profile_id = auth.uid() or public.is_staff());
drop policy if exists participants_self_update on public.participants;
create policy participants_self_update on public.participants for update
  using (profile_id = auth.uid() or public.is_staff())
  with check (profile_id = auth.uid() or public.is_staff());
drop policy if exists participants_delete on public.participants;
create policy participants_delete on public.participants for delete
  using (public.is_superadmin());

-- payments: el participante ve y crea los suyos; solo la directiva cambia estado
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select
  using (participant_id = public.my_participant_id() or public.is_staff());
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert
  with check (
    (participant_id = public.my_participant_id() and status = 'pendiente')
    or public.is_staff()
  );
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update
  using (public.is_staff()) with check (public.is_staff());

-- un participante no puede aprobar su propio pago ni alterar montos ya validados
create or replace function public.guard_payment_update()
returns trigger language plpgsql as $$
begin
  if not public.is_staff() then
    raise exception 'Solo la administración puede cambiar el estado de un pago.';
  end if;
  if old.status = 'validado' and new.status = 'validado'
     and (new.amount is distinct from old.amount or new.operation_number is distinct from old.operation_number) then
    raise exception 'Un pago aprobado no puede ser modificado; registre el ajuste como una nueva operación.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_payment_update on public.payments;
create trigger trg_guard_payment_update before update on public.payments
for each row execute function public.guard_payment_update();

-- payment_reviews: append-only
drop policy if exists reviews_read on public.payment_reviews;
create policy reviews_read on public.payment_reviews for select
  using (
    public.is_staff()
    or exists (select 1 from public.payments p
               where p.id = payment_id and p.participant_id = public.my_participant_id())
  );
drop policy if exists reviews_insert on public.payment_reviews;
create policy reviews_insert on public.payment_reviews for insert
  with check (public.is_staff());
drop policy if exists reviews_no_update on public.payment_reviews;
create policy reviews_no_update on public.payment_reviews for update using (false);
drop policy if exists reviews_no_delete on public.payment_reviews;
create policy reviews_no_delete on public.payment_reviews for delete using (false);

-- events / sessions
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists sessions_read on public.event_sessions;
create policy sessions_read on public.event_sessions for select using (true);
drop policy if exists sessions_write on public.event_sessions;
create policy sessions_write on public.event_sessions for all
  using (public.is_staff()) with check (public.is_staff());

-- attendance
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select
  using (participant_id = public.my_participant_id() or public.is_controller());
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert
  with check (public.is_controller());
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update
  using (public.is_controller()) with check (public.is_controller());

-- documents: visibles solo si publicados y con acceso habilitado
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select
  using (
    public.is_staff()
    or (
      published = true
      and (
        requires_payment = false and exists (
          select 1 from public.participants
          where profile_id = auth.uid() and status in ('inscrito','activo','observado')
        )
        or public.docs_unlocked(public.my_participant_id())
      )
    )
  );
drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents for all
  using (public.is_staff()) with check (public.is_staff());

-- announcements
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select
  using (audience in ('todos','participantes') or public.is_staff());
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all
  using (public.is_staff()) with check (public.is_staff());

-- notifications: cada uno ve las suyas
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select
  using (profile_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- form_fields
drop policy if exists fields_read on public.form_fields;
create policy fields_read on public.form_fields for select using (true);
drop policy if exists fields_write on public.form_fields;
create policy fields_write on public.form_fields for all
  using (public.is_staff()) with check (public.is_staff());

-- audit: lectura solo directiva, nunca modificación
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_staff());
drop policy if exists audit_no_update on public.audit_log;
create policy audit_no_update on public.audit_log for update using (false);
drop policy if exists audit_no_delete on public.audit_log;
create policy audit_no_delete on public.audit_log for delete using (false);

-- duplicate_flags
drop policy if exists dup_read on public.duplicate_flags;
create policy dup_read on public.duplicate_flags for select using (public.is_staff());
drop policy if exists dup_insert on public.duplicate_flags;
create policy dup_insert on public.duplicate_flags for insert with check (true);
drop policy if exists dup_update on public.duplicate_flags;
create policy dup_update on public.duplicate_flags for update
  using (public.is_staff()) with check (public.is_staff());

-- ═══════════════════════════════════════════════════════════════════════════
--  STORAGE PRIVADO (fotos, comprobantes, documentos)
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('private-files','private-files', false)
on conflict (id) do nothing;

drop policy if exists "own folder read" on storage.objects;
create policy "own folder read" on storage.objects for select
  using (
    bucket_id = 'private-files'
    and (
      public.is_controller()
      or (storage.foldername(name))[2] in (
        select p.code from public.participants p where p.profile_id = auth.uid()
      )
    )
  );

drop policy if exists "own folder insert" on storage.objects;
create policy "own folder insert" on storage.objects for insert
  with check (
    bucket_id = 'private-files'
    and (
      public.is_staff()
      or (storage.foldername(name))[2] in (
        select p.code from public.participants p where p.profile_id = auth.uid()
      )
    )
  );

-- ── Vista de estado de cuenta (solo lectura, calculada en el servidor) ─────
create or replace view public.account_summary
with (security_invoker = true) as
select
  p.id as participant_id,
  p.code,
  p.first_names || ' ' || p.last_names as full_name,
  p.group_name,
  p.status as enrollment_status,
  s.total_amount,
  coalesce(sum(pay.amount) filter (where pay.status = 'validado'), 0) as total_paid,
  coalesce(sum(pay.amount) filter (where pay.status = 'pendiente'), 0) as pending_amount,
  greatest(s.total_amount - coalesce(sum(pay.amount) filter (where pay.status = 'validado'), 0), 0) as balance,
  count(pay.id) filter (where pay.status = 'validado') as fees_paid,
  public.docs_unlocked(p.id) as docs_unlocked
from public.participants p
cross join public.settings s
left join public.payments pay on pay.participant_id = p.id
where s.id = 'global'
group by p.id, p.code, p.first_names, p.last_names, p.group_name, p.status, s.total_amount;

-- Fin de la migración 0001

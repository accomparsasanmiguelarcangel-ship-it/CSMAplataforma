alter table public.participants
  add column if not exists participation_type text,
  add column if not exists birth_date date,
  add column if not exists fee_amount numeric(10,2),
  add column if not exists fee_adjustment_reason text,
  add column if not exists fee_adjusted_by uuid references public.profiles(id),
  add column if not exists fee_adjusted_at timestamptz;

alter table public.participants
  drop constraint if exists participants_fee_amount_nonnegative,
  add constraint participants_fee_amount_nonnegative
    check (fee_amount is null or fee_amount >= 0),
  drop constraint if exists participants_participation_type_check,
  add constraint participants_participation_type_check
    check (participation_type is null or participation_type in ('Mujer','Varón','Músico','Gala'));

create or replace function public.handle_csma_public_registration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  participant_uuid uuid;
  clean_dni text;
begin
  if meta->>'registration_source' is distinct from 'csma_public_registration' then
    return new;
  end if;

  clean_dni := regexp_replace(coalesce(meta->>'dni', ''), '[^0-9]', '', 'g');
  if length(clean_dni) <> 8
     or coalesce(length(trim(meta->>'first_names')), 0) < 2
     or coalesce(length(trim(meta->>'last_names')), 0) < 2
     or coalesce(length(trim(meta->>'phone')), 0) < 7 then
    raise exception 'Datos de inscripción incompletos o inválidos.';
  end if;

  if coalesce(meta->>'participation_type','') not in ('Mujer','Varón','Músico','Gala') then
    raise exception 'Selecciona un tipo de participación válido.';
  end if;

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, trim(meta->>'first_names') || ' ' || trim(meta->>'last_names'));

  insert into public.participants (
    profile_id, dni, first_names, last_names, phone, address, group_name, extra,
    participation_type, birth_date
  ) values (
    new.id,
    clean_dni,
    trim(meta->>'first_names'),
    trim(meta->>'last_names'),
    trim(meta->>'phone'),
    coalesce(trim(meta->>'address'), ''),
    coalesce(trim(meta->>'group_name'), ''),
    case when jsonb_typeof(meta->'extra') = 'object' then meta->'extra' else '{}'::jsonb end,
    meta->>'participation_type',
    nullif(meta->>'birth_date','')::date
  )
  returning id into participant_uuid;

  update public.profiles set participant_id = participant_uuid where id = new.id;
  return new;
end;
$function$;

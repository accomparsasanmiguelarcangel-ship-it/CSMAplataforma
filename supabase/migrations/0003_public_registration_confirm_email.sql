-- Registro público compatible con confirmación de correo.
-- El trigger se ejecuta dentro de la transacción de auth.users y crea las filas
-- con el UUID real de Supabase, sin abrir políticas INSERT al cliente anónimo.

create or replace function public.handle_csma_public_registration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    trim(meta->>'first_names') || ' ' || trim(meta->>'last_names')
  );

  insert into public.participants (
    profile_id, dni, first_names, last_names, phone, address, group_name, extra
  ) values (
    new.id,
    clean_dni,
    trim(meta->>'first_names'),
    trim(meta->>'last_names'),
    trim(meta->>'phone'),
    coalesce(trim(meta->>'address'), ''),
    coalesce(trim(meta->>'group_name'), ''),
    case when jsonb_typeof(meta->'extra') = 'object' then meta->'extra' else '{}'::jsonb end
  )
  returning id into participant_uuid;

  update public.profiles
  set participant_id = participant_uuid
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_csma_registration on auth.users;
create trigger on_auth_user_created_csma_registration
after insert on auth.users
for each row execute function public.handle_csma_public_registration();

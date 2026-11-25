create table if not exists public.participant_archive (
 archive_id uuid primary key default gen_random_uuid(), participant_id uuid not null,
 participant_code text not null, dni text not null, email text,
 archived_at timestamptz not null default now(), archived_by uuid, dossier jsonb not null
);
alter table public.participant_archive enable row level security;
revoke all on public.participant_archive from anon, authenticated;
create or replace function public.archive_participant_dossier(p_participant_id uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_p public.participants%rowtype; v_email text; v_dossier jsonb; v_archive uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','superadmin') and active=true) then
  raise exception 'Solo administradores activos pueden archivar expedientes';
 end if;
 select * into v_p from public.participants where id=p_participant_id for update;
 if not found then raise exception 'Participante no encontrado'; end if;
 select email::text into v_email from public.profiles where id=v_p.profile_id;
 v_dossier=jsonb_build_object('participant',to_jsonb(v_p),'profile',(select to_jsonb(p) from public.profiles p where p.id=v_p.profile_id),
 'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.payments x where x.participant_id=v_p.id),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.payment_reviews r join public.payments x on x.id=r.payment_id where x.participant_id=v_p.id),
 'attendance',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.attendance a where a.participant_id=v_p.id),
 'media_refs',jsonb_build_object('photo_storage_path',v_p.photo_storage_path,'photo_drive_id',v_p.photo_drive_id,'qr_drive_id',v_p.qr_drive_id));
 insert into public.participant_archive(participant_id,participant_code,dni,email,archived_by,dossier)
 values(v_p.id,v_p.code,v_p.dni,v_email,auth.uid(),v_dossier) returning archive_id into v_archive;
 return v_archive;
end $$;
revoke all on function public.archive_participant_dossier(uuid) from public,anon;
grant execute on function public.archive_participant_dossier(uuid) to authenticated;
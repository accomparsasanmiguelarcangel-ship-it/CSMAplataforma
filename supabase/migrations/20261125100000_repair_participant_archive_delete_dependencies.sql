create or replace function public.archive_and_remove_participant(p_participant_id uuid, p_expected_code text)
returns uuid language plpgsql security definer set search_path=public,auth
as $$
declare v_p public.participants%rowtype; v_email text; v_archive uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','superadmin') and active=true) then raise exception 'Solo administradores activos pueden dar de baja participantes'; end if;
 select * into v_p from public.participants where id=p_participant_id for update;
 if not found then raise exception 'Participante no encontrado'; end if;
 if v_p.code <> p_expected_code then raise exception 'El código de confirmación no coincide'; end if;
 select email::text into v_email from public.profiles where id=v_p.profile_id;
 insert into public.participant_archive(participant_id,participant_code,dni,email,archived_by,dossier)
 values(v_p.id,v_p.code,v_p.dni,v_email,auth.uid(),
 jsonb_build_object('participant',to_jsonb(v_p),'profile',(select to_jsonb(pr) from public.profiles pr where pr.id=v_p.profile_id),
 'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.payments x where x.participant_id=v_p.id),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.payment_reviews r join public.payments x on x.id=r.payment_id where x.participant_id=v_p.id),
 'attendance',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.attendance a where a.participant_id=v_p.id),
 'media_refs',jsonb_build_object('photo_storage_path',v_p.photo_storage_path,'photo_drive_id',v_p.photo_drive_id,'qr_drive_id',v_p.qr_drive_id)))
 returning archive_id into v_archive;
 delete from public.attendance where participant_id=v_p.id;
 delete from public.payment_reviews where payment_id in (select id from public.payments where participant_id=v_p.id);
 delete from public.payments where participant_id=v_p.id;
 delete from public.participants where id=v_p.id;
 if v_p.profile_id is not null then delete from auth.users where id=v_p.profile_id; end if;
 return v_archive;
end $$;
revoke all on function public.archive_and_remove_participant(uuid,text) from public,anon;
grant execute on function public.archive_and_remove_participant(uuid,text) to authenticated;
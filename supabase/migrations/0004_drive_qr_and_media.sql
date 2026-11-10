-- Campos para conservar referencias de archivos en Google Drive.
alter table public.participants
  add column if not exists qr_drive_id text;

create index if not exists participants_qr_drive_id_idx
  on public.participants (qr_drive_id)
  where qr_drive_id is not null;

-- Storage upsert requiere permiso UPDATE además de INSERT.
drop policy if exists "own folder update" on storage.objects;
create policy "own folder update" on storage.objects for update
  using (
    bucket_id = 'private-files'
    and (
      public.is_staff()
      or (storage.foldername(name))[2] in (
        select p.code from public.participants p where p.profile_id = auth.uid()
      )
    )
  )
  with check (
    bucket_id = 'private-files'
    and (
      public.is_staff()
      or (storage.foldername(name))[2] in (
        select p.code from public.participants p where p.profile_id = auth.uid()
      )
    )
  );

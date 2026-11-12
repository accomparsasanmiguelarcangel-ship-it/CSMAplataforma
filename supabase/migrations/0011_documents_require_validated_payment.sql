-- Every institutional document requires at least one validated payment.
create or replace function public.docs_unlocked(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_id is null then false
    when not exists (
      select 1 from public.participants
      where id = p_id and status in ('inscrito','activo','observado')
    ) then false
    else public.participant_paid(p_id) > 0
  end;
$$;

drop policy if exists documents_read on public.documents;
create policy documents_read
on public.documents
for select
to authenticated
using (
  is_staff()
  or (published = true and docs_unlocked(my_participant_id()))
);

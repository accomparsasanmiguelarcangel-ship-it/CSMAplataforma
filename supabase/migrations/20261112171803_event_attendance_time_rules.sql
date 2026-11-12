alter table public.events
  add column if not exists late_after time without time zone not null default '09:15',
  add column if not exists entry_until time without time zone not null default '23:59';

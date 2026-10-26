-- Preserve the first time an accomplished record was detected so the UI can
-- show a precise validation time beneath its validation date.
alter table public.accomplishment_log
  add column if not exists first_seen_at timestamptz;

alter table public.accomplishment_log
  alter column first_seen_at set default now();

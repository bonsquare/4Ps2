-- Approved users may add log rows, but can no longer choose the date: first_seen is always filled in by the
-- database (today, Asia/Manila). Without this, anyone with the public anon key could back-date a validation.
revoke insert on public.accomplishment_log from authenticated;
grant insert (entry_key, province) on public.accomplishment_log to authenticated;

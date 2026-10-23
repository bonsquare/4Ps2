-- Remembers the first day each undated accomplished beneficiary was seen, so the daily graph keeps
-- an accurate history even when the sheet's date columns are blank.
create table if not exists public.accomplishment_log (
  entry_key text primary key,
  province text not null,
  first_seen date not null default ((now() at time zone 'Asia/Manila')::date)
);

alter table public.accomplishment_log enable row level security;

grant select, insert on public.accomplishment_log to authenticated;
grant all on public.accomplishment_log to service_role;

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

create policy "approved users can read the accomplishment log"
on public.accomplishment_log for select
using (public.is_approved_user());

create policy "approved users can add to the accomplishment log"
on public.accomplishment_log for insert
with check (public.is_approved_user());

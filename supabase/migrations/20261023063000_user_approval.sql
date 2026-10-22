create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(trim(full_name)) > 0),
  position text not null check (char_length(trim(position)) > 0),
  province text not null check (char_length(trim(province)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  is_super_admin boolean not null default false,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

alter table public.user_profiles enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_super_admin and status = 'approved'
  );
$$;

create policy "users can view their own profile"
on public.user_profiles for select
using (auth.uid() = id or public.is_super_admin());

create policy "users can submit their own pending profile"
on public.user_profiles for insert
with check (auth.uid() = id and status = 'pending' and not is_super_admin);

create policy "users can amend a pending profile"
on public.user_profiles for update
using (auth.uid() = id and status = 'pending' and not is_super_admin)
with check (auth.uid() = id and status = 'pending' and not is_super_admin);

create policy "super admins can manage profiles"
on public.user_profiles for all
using (public.is_super_admin())
with check (public.is_super_admin());

create or replace function public.bootstrap_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'bonie.office@gmail.com' then
    insert into public.user_profiles (id, email, full_name, position, province, status, is_super_admin)
    values (new.id, new.email, 'Bonifacio Orong', 'Super Administrator', 'Regional Office', 'approved', true)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists bootstrap_super_admin_on_signup on auth.users;
create trigger bootstrap_super_admin_on_signup
after insert on auth.users
for each row execute procedure public.bootstrap_super_admin();

insert into public.user_profiles (id, email, full_name, position, province, status, is_super_admin)
select id, email, 'Bonifacio Orong', 'Super Administrator', 'Regional Office', 'approved', true
from auth.users
where lower(email) = 'bonie.office@gmail.com'
on conflict (id) do update
set is_super_admin = true, status = 'approved';

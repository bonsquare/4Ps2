create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  full_name text not null check (char_length(trim(full_name)) > 0),
  position text not null check (char_length(trim(position)) > 0),
  province text not null check (char_length(trim(province)) > 0),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  -- Keep the record aligned with the default Supabase Auth invite lifetime.
  expires_at timestamptz not null default (now() + interval '1 hour'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_invitations_active_email_idx
on public.user_invitations (email)
where status = 'pending';

alter table public.user_invitations enable row level security;
grant select, insert, update on public.user_invitations to authenticated;
grant all on public.user_invitations to service_role;

create policy "super admins can manage invitations"
on public.user_invitations for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Keep self-registration available, but prevent an invited Google account from
-- submitting a profile under a different email address.
drop policy if exists "users can submit their own pending profile" on public.user_profiles;
create policy "users can submit their own pending profile"
on public.user_profiles for insert
with check (
  auth.uid() = id
  and status = 'pending'
  and not is_super_admin
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

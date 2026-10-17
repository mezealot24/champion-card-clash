-- Only Q's account may exist in auth (Q 2026-10-17): any other email is rejected at sign-up,
-- so an OTP request for another address can't create a user. Q's account becomes super_admin.
create or replace function public.only_admin_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if lower(new.email) is distinct from 'wiriya.on@gmail.com' then
    raise exception 'sign-up is closed';
  end if;
  return new;
end $$;

create trigger only_admin_email before insert on auth.users
  for each row execute function public.only_admin_email();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role)
  values (new.id, case when lower(new.email) = 'wiriya.on@gmail.com' then 'super_admin'::public.app_role else 'player' end);
  return new;
end $$;

revoke execute on function public.only_admin_email() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- account created before this migration
update public.profiles p set role = 'super_admin'
from auth.users u where u.id = p.id and lower(u.email) = 'wiriya.on@gmail.com';

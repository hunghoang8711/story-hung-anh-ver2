create extension if not exists pgcrypto;

-- =========================================================
-- 1. Couple
-- =========================================================

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'HUNG × ANH',
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.couple_members
    where couple_id = p_couple_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_couple_member(uuid) from public;
grant execute on function public.is_couple_member(uuid) to authenticated;

alter table public.couple_members enable row level security;

drop policy if exists "users can read own couple membership"
on public.couple_members;

create policy "users can read own couple membership"
on public.couple_members
for select
to authenticated
using (user_id = auth.uid());

insert into public.couples (name)
select 'HUNG × ANH'
where not exists (select 1 from public.couples);

insert into public.couple_members (couple_id, user_id)
select
  (select id from public.couples order by created_at limit 1),
  u.id
from auth.users u
where u.email in ('h871work@gmail.com', 'hunghoang87121@gmail.com')
on conflict do nothing;

-- =========================================================
-- 2. Stories
-- =========================================================

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  story_date date not null default current_date,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stories
add column if not exists couple_id uuid
references public.couples(id)
on delete cascade;

update public.stories
set couple_id = (
  select id from public.couples order by created_at limit 1
)
where couple_id is null;

alter table public.stories
alter column couple_id set not null;

alter table public.stories enable row level security;

drop policy if exists "authenticated users can read stories" on public.stories;
drop policy if exists "authenticated users can create stories" on public.stories;
drop policy if exists "couple members can read stories" on public.stories;
drop policy if exists "couple members can create stories" on public.stories;
drop policy if exists "authors can update their stories" on public.stories;
drop policy if exists "authors can delete their stories" on public.stories;

create policy "couple members can read stories"
on public.stories
for select
to authenticated
using (public.is_couple_member(couple_id));

create policy "couple members can create stories"
on public.stories
for insert
to authenticated
with check (
  auth.uid() = author_id
  and public.is_couple_member(couple_id)
);

create policy "authors can update their stories"
on public.stories
for update
to authenticated
using (
  auth.uid() = author_id
  and public.is_couple_member(couple_id)
)
with check (
  auth.uid() = author_id
  and public.is_couple_member(couple_id)
);

create policy "authors can delete their stories"
on public.stories
for delete
to authenticated
using (
  auth.uid() = author_id
  and public.is_couple_member(couple_id)
);

create index if not exists stories_couple_date_idx
on public.stories (couple_id, story_date desc, created_at desc);

-- =========================================================
-- 3. Story images
-- =========================================================

create table if not exists public.story_images (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  storage_path text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.story_images enable row level security;

drop policy if exists "couple members can read story images" on public.story_images;
drop policy if exists "couple members can create story images" on public.story_images;
drop policy if exists "couple members can delete story images" on public.story_images;

create policy "couple members can read story images"
on public.story_images
for select
to authenticated
using (public.is_couple_member(couple_id));

create policy "couple members can create story images"
on public.story_images
for insert
to authenticated
with check (
  public.is_couple_member(couple_id)
  and exists (
    select 1
    from public.stories s
    where s.id = story_id
      and s.couple_id = couple_id
  )
);

create policy "couple members can delete story images"
on public.story_images
for delete
to authenticated
using (public.is_couple_member(couple_id));

-- =========================================================
-- 4. Private Storage bucket
-- =========================================================

insert into storage.buckets (id, name, public)
values ('story-images', 'story-images', false)
on conflict (id) do update set public = false;

drop policy if exists "couple members can upload story images" on storage.objects;
drop policy if exists "couple members can read story images" on storage.objects;
drop policy if exists "couple members can delete story images" on storage.objects;

create policy "couple members can upload story images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'story-images'
  and public.is_couple_member((storage.foldername(name))[1]::uuid)
);

create policy "couple members can read story images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'story-images'
  and public.is_couple_member((storage.foldername(name))[1]::uuid)
);

create policy "couple members can delete story images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'story-images'
  and public.is_couple_member((storage.foldername(name))[1]::uuid)
);

-- =========================================================
-- 5. Realtime
-- =========================================================
-- Enable public.stories in Supabase Dashboard:
-- Database > Publications/Replication > supabase_realtime > stories
-- The frontend is already configured to subscribe to story changes.

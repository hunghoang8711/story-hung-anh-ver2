create extension if not exists pgcrypto;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  story_date date not null default current_date,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stories enable row level security;

drop policy if exists "authenticated users can read stories" on public.stories;
drop policy if exists "authenticated users can create stories" on public.stories;
drop policy if exists "authors can update their stories" on public.stories;
drop policy if exists "authors can delete their stories" on public.stories;

create policy "authenticated users can read stories"
on public.stories for select to authenticated using (true);

create policy "authenticated users can create stories"
on public.stories for insert to authenticated
with check (auth.uid() = author_id);

create policy "authors can update their stories"
on public.stories for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

create policy "authors can delete their stories"
on public.stories for delete to authenticated
using (auth.uid() = author_id);

-- Enable Realtime for public.stories in Supabase Dashboard.
-- Storage and stricter two-person membership policies will be added in the next backend step.

-- Memory features migration: location + tags
-- Safe to run once; does not modify or delete existing stories/photos.
alter table public.stories
  add column if not exists location text,
  add column if not exists tags text[] not null default '{}';

create index if not exists stories_tags_gin_idx
  on public.stories using gin (tags);

create index if not exists stories_location_idx
  on public.stories (location);

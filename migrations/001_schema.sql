create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  subtitle text,
  intro text,
  theme jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  key text not null,
  title text not null,
  description text not null default '',
  mode text not null check (mode in ('prompt','trivia','competition')),
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  unique(event_id, key)
);

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  body text not null,
  note text
);

create table if not exists public.trivia_questions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  question text not null,
  answers jsonb not null,
  correct_index integer not null,
  time_limit_seconds integer not null default 10,
  points_base integer not null default 100,
  speed_bonus_per_second integer not null default 5
);

create table if not exists public.trivia_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  display_name text not null,
  device_token text not null,
  score integer not null,
  completed_at timestamptz not null default now()
);

create index if not exists trivia_scores_event_idx
  on public.trivia_scores(event_id, score desc, completed_at asc);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid unique not null references public.experiences(id) on delete cascade,
  title text not null,
  prompt text not null,
  entry_type text not null check (entry_type in ('text','photo')),
  minimum_entries integer not null default 3 check (minimum_entries >= 2),
  voting_enabled boolean not null default true,
  max_votes_per_device integer not null default 1 check (max_votes_per_device >= 1)
);

create table if not exists public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  display_name text,
  text_entry text,
  media_url text,
  created_at timestamptz not null default now(),
  check (text_entry is not null or media_url is not null)
);

create table if not exists public.competition_votes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  entry_id uuid not null references public.competition_entries(id) on delete cascade,
  device_token text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists competition_vote_once_per_entry_device
  on public.competition_votes(entry_id, device_token);

create or replace view public.competition_entry_results as
select
  e.id,
  e.competition_id,
  e.display_name,
  e.text_entry,
  e.media_url,
  e.created_at,
  count(v.id)::int as votes
from public.competition_entries e
left join public.competition_votes v on v.entry_id = e.id
group by e.id;

alter table public.events enable row level security;
alter table public.experiences enable row level security;
alter table public.prompts enable row level security;
alter table public.trivia_questions enable row level security;
alter table public.trivia_scores enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;
alter table public.competition_votes enable row level security;

-- Public read is needed only for Realtime refreshes and harmless display data.
create policy "public read active events" on public.events
  for select using (active = true);
create policy "public read experiences" on public.experiences
  for select using (true);
create policy "public read prompts" on public.prompts
  for select using (true);
create policy "public read trivia questions" on public.trivia_questions
  for select using (true);
create policy "public read trivia scores" on public.trivia_scores
  for select using (true);
create policy "public read competitions" on public.competitions
  for select using (true);
create policy "public read competition entries" on public.competition_entries
  for select using (true);
create policy "public read competition votes" on public.competition_votes
  for select using (true);

-- Mutations go through server-side Vercel route handlers using the service-role key.

insert into storage.buckets (id, name, public)
values ('competition-uploads', 'competition-uploads', true)
on conflict (id) do nothing;

-- Add tables to Supabase Realtime publication when available.
do $$
begin
  alter publication supabase_realtime add table public.trivia_scores;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.competition_entries;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.competition_votes;
exception when duplicate_object then null;
end $$;

-- Adds reusable scenario-based experiences such as "A Little Trouble".
-- Safe to run on an existing project after 001-006.
-- (Shipped as 004_scenario_mode.sql; renumbered to 007 because 004 was already used.)

alter table public.experiences drop constraint if exists experiences_mode_check;
alter table public.experiences
  add constraint experiences_mode_check
  check (mode in ('prompt','trivia','competition','scenario'));

create table if not exists public.scenario_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  group_name text,
  plan text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scenario_votes (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  entry_id uuid not null references public.scenario_entries(id) on delete cascade,
  device_token text not null,
  created_at timestamptz not null default now(),
  unique(prompt_id, device_token)
);

create or replace view public.scenario_entry_results
with (security_invoker = true) as
select
  e.id,
  e.event_id,
  e.experience_id,
  e.prompt_id,
  e.group_name,
  e.plan,
  e.created_at,
  count(v.id)::int as votes
from public.scenario_entries e
left join public.scenario_votes v on v.entry_id = e.id
group by e.id;

alter table public.scenario_entries enable row level security;
alter table public.scenario_votes enable row level security;

create policy "public read scenario entries" on public.scenario_entries
  for select using (true);
create policy "public read scenario votes" on public.scenario_votes
  for select using (true);

do $$
begin
  alter publication supabase_realtime add table public.scenario_entries;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.scenario_votes;
exception when duplicate_object then null;
end $$;

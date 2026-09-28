-- Jeopardy-style trivia: guests pick a category and a point value (1, 2 or 5),
-- questions are untimed, and the whole activity runs on one countdown that
-- starts with the first answered question.
--
-- Anti-cheat: answers never leave the server, scoring happens server-side,
-- and a question that is revealed can never be revealed again for that guest
-- (leaving the screen forfeits it).

-- Questions: category + point value + a fixed order, so every guest sees the
-- same questions in the same sequence for each category/value.
alter table public.trivia_questions
  add column if not exists category text,
  add column if not exists points integer,
  add column if not exists sort_order integer not null default 0;

delete from public.trivia_questions where category is null or points is null;

alter table public.trivia_questions
  alter column category set not null,
  alter column points set not null,
  drop column if exists time_limit_seconds,
  drop column if exists points_base,
  drop column if exists speed_bonus_per_second;

alter table public.trivia_questions
  drop constraint if exists trivia_questions_points_check;
alter table public.trivia_questions
  add constraint trivia_questions_points_check check (points > 0);

create index if not exists trivia_questions_bucket_idx
  on public.trivia_questions(experience_id, category, points, sort_order);

-- Correct answers must never be readable with the public (anon) key.
drop policy if exists "public read trivia questions" on public.trivia_questions;

-- One row per guest per trivia experience. The secret is a random token kept
-- in the guest's browser; it is only ever compared server-side.
create table if not exists public.trivia_players (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  player_secret text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique(experience_id, player_secret)
);

-- Every question a guest has revealed. status:
--   open      revealed, not answered yet
--   answered  answered (right or wrong)
--   forfeited guest left the screen or reloaded before answering
create table if not exists public.trivia_attempts (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  player_id uuid not null references public.trivia_players(id) on delete cascade,
  question_id uuid not null references public.trivia_questions(id) on delete cascade,
  status text not null default 'open' check (status in ('open','answered','forfeited')),
  chosen_index integer,
  is_correct boolean,
  points_awarded integer not null default 0,
  opened_at timestamptz not null default now(),
  answered_at timestamptz,
  unique(player_id, question_id)
);

create index if not exists trivia_attempts_experience_idx
  on public.trivia_attempts(experience_id, status, answered_at);

-- No public policies: these tables are only touched by server route handlers
-- using the service-role key.
alter table public.trivia_players enable row level security;
alter table public.trivia_attempts enable row level security;

-- The old client-submitted score table is replaced by trivia_attempts.
drop table if exists public.trivia_scores;

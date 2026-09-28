-- 014: renumbered from the patch's 013 (013 was already used by trouble_truth_or_dare).
-- Collaborative trivia relay: answer -> Play Nice / Choose Violence -> choose next player.
create table if not exists public.trivia_relay_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','live','complete')),
  current_participant_id uuid references public.event_participants(id) on delete set null,
  sender_participant_id uuid references public.event_participants(id) on delete set null,
  pending_difficulty text check (pending_difficulty is null or pending_difficulty in ('nice','violence')),
  round_number integer not null default 0,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id,experience_id)
);
create table if not exists public.trivia_relay_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trivia_relay_sessions(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  sender_participant_id uuid references public.event_participants(id) on delete set null,
  question_id uuid not null references public.trivia_questions(id) on delete cascade,
  difficulty text not null check (difficulty in ('nice','violence')),
  status text not null default 'open' check (status in ('open','answered')),
  chosen_index integer,
  is_correct boolean,
  points_awarded integer not null default 0,
  opened_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists trivia_relay_attempts_session_idx on public.trivia_relay_attempts(session_id,answered_at);
alter table public.trivia_relay_sessions enable row level security;
alter table public.trivia_relay_attempts enable row level security;
-- Sessions are public (turn state / stats, harmless). Attempts are NOT: chosen_index and
-- is_correct together reveal the right answer once anyone has answered a question, so
-- attempts stay server-only (service-role key), same as trouble_role_votes.
drop policy if exists "public read trivia relay sessions" on public.trivia_relay_sessions;
drop policy if exists "public read trivia relay attempts" on public.trivia_relay_attempts;
create policy "public read trivia relay sessions" on public.trivia_relay_sessions for select using (true);
do $$ begin alter publication supabase_realtime add table public.trivia_relay_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.trivia_relay_attempts; exception when duplicate_object then null; end $$;
update public.experiences set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('collaborative_relay',true,'relay_easy_points',1,'relay_hard_points',5) where mode='trivia';

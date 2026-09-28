-- 011: category lock-in + collaborative A Little Trouble crew
create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  -- SHA-256 of the guest's device token (this table is publicly readable).
  device_token text not null,
  display_name text not null,
  locked_at timestamptz not null default now(),
  unique(event_id, device_token)
);
create index if not exists event_participants_experience_idx on public.event_participants(event_id, experience_id, locked_at);

create table if not exists public.trouble_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','voting','planning','review','submitted')),
  vote_round integer not null default 1,
  plain_summary text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, experience_id)
);

create table if not exists public.trouble_role_votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trouble_sessions(id) on delete cascade,
  voter_participant_id uuid not null references public.event_participants(id) on delete cascade,
  role_key text not null,
  nominee_participant_id uuid not null references public.event_participants(id) on delete cascade,
  round integer not null default 1,
  created_at timestamptz not null default now(),
  unique(session_id, voter_participant_id, role_key, round)
);

create table if not exists public.trouble_role_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trouble_sessions(id) on delete cascade,
  role_key text not null,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(session_id, role_key),
  unique(session_id, participant_id)
);

create table if not exists public.trouble_plan_pieces (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trouble_sessions(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  role_key text not null,
  contribution text not null,
  approved boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(session_id, participant_id)
);

alter table public.event_participants enable row level security;
alter table public.trouble_sessions enable row level security;
alter table public.trouble_role_votes enable row level security;
alter table public.trouble_role_assignments enable row level security;
alter table public.trouble_plan_pieces enable row level security;

create policy "public read event participants" on public.event_participants for select using (true);
create policy "public read trouble sessions" on public.trouble_sessions for select using (true);
create policy "public read trouble role assignments" on public.trouble_role_assignments for select using (true);
create policy "public read trouble plan pieces" on public.trouble_plan_pieces for select using (true);

do $$ begin alter publication supabase_realtime add table public.event_participants; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.trouble_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.trouble_role_assignments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.trouble_plan_pieces; exception when duplicate_object then null; end $$;

-- Host chooses one Trouble mission for this rental. The roles below are heist roles,
-- so Chapman starts on the bank-robbery scenario. Change trouble_prompt_id to switch missions.
do $$
declare v_event uuid; v_trouble uuid; v_prompt uuid;
begin
  select id into v_event from public.events where slug='chapman-thanksgiving-2026';
  select id into v_trouble from public.experiences where event_id=v_event and key='trouble';
  select id into v_prompt from public.prompts where experience_id=v_trouble and body ilike '%perfect bank robbery%' limit 1;
  if v_trouble is not null and v_prompt is not null then
    update public.experiences set config=coalesce(config,'{}'::jsonb) || jsonb_build_object(
      'trouble_prompt_id',v_prompt,
      'trouble_min_crew',2,
      'trouble_roles',jsonb_build_array(
        jsonb_build_object('key','planner','label','The Planner','bio','A strategic thinker who can turn a pile of half-good ideas into one plan people can actually follow.','planning_prompt','Build the overall plan. Explain the order of events and how the crew gets from start to finish.','constraint','The Lookout cannot work in complete darkness. Account for that in the timing and sequence.'),
        jsonb_build_object('key','driver','label','The Driver','bio','Calm under pressure, good with timing, routes and getting everyone where they need to be without drama.','planning_prompt','Explain the transport plan, timing and pickup or exit arrangement.','constraint','The Tech needs ten uninterrupted minutes on site before the crew can leave.'),
        jsonb_build_object('key','tech','label','The Tech','bio','A nerdy problem-solver who notices systems, patterns and workarounds before everybody else does.','planning_prompt','Explain what your role needs from the rest of the crew and what has to happen before your part can work.','constraint','The Planner forgot to include your setup time in the original timeline. You need the plan adjusted.'),
        jsonb_build_object('key','lookout','label','The Lookout','bio','Observant, patient and annoyingly good at noticing things everybody else missed.','planning_prompt','Explain where you position yourself, what you are watching for and how you communicate with the crew.','constraint','The Driver cannot see your position from the vehicle. Your warning system has to work without visual contact.'),
        jsonb_build_object('key','talker','label','The Talker','bio','Can think on their feet, keep a straight face and make a weird situation sound almost reasonable.','planning_prompt','Explain how you handle unexpected human interaction without threats, violence or escalating the situation.','constraint','The person you may need to distract is unusually chatty and keeps asking follow-up questions.'),
        jsonb_build_object('key','retrieval','label','The Retrieval','bio','Practical, coordinated and trusted with the one physical task everybody else is building around.','planning_prompt','Explain what you need from the crew to complete the retrieval and get clear safely.','constraint','You cannot carry the object and use your phone at the same time. Someone else has to relay updates.')
      )
    ) where id=v_trouble;
  end if;
end $$;

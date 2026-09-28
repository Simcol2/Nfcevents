-- 013: A Little Trouble -> asynchronous role-based Truth or Dare.
-- The host does not configure or pre-approve individual dares.
-- Renting/choosing the experience is the opt-in; the host can play like anyone else.

alter table public.trouble_sessions
  alter column prompt_id drop not null;

alter table public.trouble_sessions
  drop constraint if exists trouble_sessions_status_check;

alter table public.trouble_sessions
  add column if not exists wrapped_at timestamptz,
  add column if not exists host_wrap_text text;

alter table public.trouble_sessions
  add constraint trouble_sessions_status_check
  check (status in ('lobby','voting','active','wrapped'));

-- Freeze the crew at lock time. This prevents a late join from changing the role vote.
create table if not exists public.trouble_session_members (
  session_id uuid not null references public.trouble_sessions(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, participant_id)
);

-- One role-specific dare bank. Dares are private until completed/passed or shared via collaboration.
create table if not exists public.trouble_dares (
  id uuid primary key default gen_random_uuid(),
  role_key text not null,
  title text not null,
  dare_text text not null,
  success_text text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists trouble_dares_role_idx on public.trouble_dares(role_key, active);

create table if not exists public.trouble_truths (
  id uuid primary key default gen_random_uuid(),
  prompt text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.trouble_player_tasks (
  session_id uuid not null references public.trouble_sessions(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  role_key text not null,
  dare_id uuid references public.trouble_dares(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned','completed','caught','truth')),
  truth_id uuid references public.trouble_truths(id) on delete set null,
  truth_answer text,
  result_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, participant_id)
);

-- A collaboration is a two-person alliance. Sending the request is the requester's acceptance;
-- the invited player must independently accept before either side sees the other's dare.
create table if not exists public.trouble_collabs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trouble_sessions(id) on delete cascade,
  requester_id uuid not null references public.event_participants(id) on delete cascade,
  helper_id uuid not null references public.event_participants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> helper_id)
);
create index if not exists trouble_collabs_session_idx on public.trouble_collabs(session_id, status);

alter table public.trouble_session_members enable row level security;
alter table public.trouble_dares enable row level security;
alter table public.trouble_truths enable row level security;
alter table public.trouble_player_tasks enable row level security;
alter table public.trouble_collabs enable row level security;

-- Public reads are limited to harmless lobby/reveal data. Private dares/truths/collabs are server-only.
drop policy if exists "public read trouble session members" on public.trouble_session_members;
drop policy if exists "public read trouble dares" on public.trouble_dares;
drop policy if exists "public read trouble truths" on public.trouble_truths;
create policy "public read trouble session members" on public.trouble_session_members for select using (true);
create policy "public read trouble dares" on public.trouble_dares for select using (true);
create policy "public read trouble truths" on public.trouble_truths for select using (true);

-- Clean out the old plan-builder rows. Role votes/assignments are reused.
delete from public.trouble_plan_pieces;

-- Replace the old heist role set with personality roles that determine dare pools.
update public.experiences
set config = (coalesce(config,'{}'::jsonb) - 'trouble_prompt_id') || jsonb_build_object(
  'trouble_async_truth_dare', true,
  'trouble_min_crew', 2,
  'trouble_roles', jsonb_build_array(
    jsonb_build_object('key','sneak','label','The Sneak','bio','Who could do something right in front of everybody and somehow not get caught?'),
    jsonb_build_object('key','smooth_talker','label','The Smooth Talker','bio','Who could say something ridiculous with a straight face and somehow sell it?'),
    jsonb_build_object('key','instigator','label','The Instigator','bio','Who could quietly start something and make it look like somebody else\'s idea?'),
    jsonb_build_object('key','charmer','label','The Charmer','bio','Who could convince somebody to do something they were absolutely not planning to do?'),
    jsonb_build_object('key','observer','label','The Observer','bio','Who notices tiny things about what everybody else is doing before anyone else does?'),
    jsonb_build_object('key','actor','label','The Actor','bio','Who could commit to a bit without laughing and ruining it?'),
    jsonb_build_object('key','social_engineer','label','The Social Engineer','bio','Who could steer a perfectly normal situation toward a very specific outcome?'),
    jsonb_build_object('key','wildcard','label','The Wildcard','bio','Who would fully commit to a bizarre harmless task with almost no questions asked?')
  )
)
where key='trouble';

-- DARE BANK ---------------------------------------------------------------
-- SNEAK
insert into public.trouble_dares(role_key,title,dare_text,success_text) values
('sneak','The Switch','Find two framed photos already sitting out in a common area. Swap the photos inside the frames and put both frames back where they started.','Both frames are back where they started with the photos swapped.'),
('sneak','Left Behind','Move the left shoes that guests have already left by the front door into one crew member\'s car, one at a time. Do not remove shoes from anyone\'s feet. Put every shoe back after the reveal.','Every available left shoe reached the car one at a time.'),
('sneak','Case Closed','Get the removable phone case off the oldest adult in the room and leave the case somewhere visible but unexpected for sixty seconds. Then put it back.','The case spent sixty seconds in the new spot and was returned.'),
('sneak','Remote Control','Move the TV remote to a different visible surface in the same room for five minutes, then return it.','The remote stayed in the new spot for five minutes and came back.'),
('sneak','Turnaround','Rotate three small decorative objects in common areas so they face the opposite direction. Do not let anyone outside Trouble see the actual turn.','All three objects were turned without the move being spotted.'),
('sneak','Background Check','Get into the background of two photos being taken by people outside Trouble without asking to join either photo.','You appeared in two outside photos without being invited in.'),

-- SMOOTH TALKER
('smooth_talker','Say It','Get somebody outside Trouble to naturally say the exact phrase “that makes no sense.” You cannot say the phrase first or ask them to repeat it.','A non-crew guest said the exact phrase naturally.'),
('smooth_talker','Seriously?','Get somebody outside Trouble to say “are you serious?” naturally. You cannot say it first.','A non-crew guest said “are you serious?” naturally.'),
('smooth_talker','The Recommendation','Convince somebody outside Trouble that they should try a harmless food, drink, show, song, or product you choose, without telling them this is a dare.','They agreed they should try it.'),
('smooth_talker','Tiny Debate','Get two people outside Trouble to disagree about a completely harmless topic you introduce, then leave the conversation before they finish debating it.','Two non-crew guests were debating after you left.'),
('smooth_talker','Borrowed Opinion','Get somebody outside Trouble to repeat one of your harmless opinions to a third person as if they now agree with it.','Your opinion successfully travelled through somebody else.'),

-- INSTIGATOR
('instigator','Photo Op','Get somebody outside Trouble to suggest taking a group photo. Nobody in Trouble may directly suggest a group photo or ask for a picture.','A non-crew guest independently suggested the group photo.'),
('instigator','Applause','Get at least five people outside Trouble to clap at the same time. You may not say “clap,” start Happy Birthday, or directly ask for applause.','At least five people clapped together.'),
('instigator','The Migration','Get four people outside Trouble to move from one room to another within two minutes without announcing a room change or directly asking the group to move.','Four non-crew guests changed rooms inside two minutes.'),
('instigator','Selfie Domino','Get three different people outside Trouble to take a selfie within ten minutes. You may not directly tell anyone to take a selfie.','Three non-crew guests took selfies inside ten minutes.'),
('instigator','Same Word','Get three different people outside Trouble to say the word “dramatic” in separate conversations. Nobody in Trouble may say the word first.','Three different people said “dramatic” naturally.'),

-- CHARMER
('charmer','Musical Chairs','Get two people outside Trouble to fully swap seats and stay in the new seats for five minutes. You may not directly ask either person to swap seats.','Both people stayed in each other\'s seats for five minutes.'),
('charmer','Bring Me Something','Choose one ordinary harmless object in the room. Get somebody outside Trouble to bring it to you without directly asking them to bring you that object.','The object was delivered to you by a non-crew guest.'),
('charmer','Operation Hype','Choose one person outside Trouble. Get three different people to compliment that person within ten minutes without telling anyone there is a compliment mission.','The target received three separate compliments.'),
('charmer','Change My Mind','Get somebody outside Trouble to change their stated opinion about a harmless topic during one conversation.','They changed their stated opinion before the conversation ended.'),
('charmer','The Favour','Get somebody outside Trouble to do one tiny harmless favour for you without using the words “can you,” “could you,” or “please.”','They did the favour without you using any banned phrase.'),

-- OBSERVER
('observer','First to Leave','Before the next course or major moment ends, correctly predict which non-crew guest will be the first to leave the room. Lock your prediction in the app before it happens.','Your prediction was correct.'),
('observer','Phone Check','Correctly predict which person outside Trouble will be the next to check their phone. Lock it in before they do.','Your prediction was correct.'),
('observer','Refill Watch','Predict who will be the next person to refill a drink, get water, or return to the kitchen.','Your prediction was correct.'),
('observer','Three Details','Without asking, notice and later report three specific things about one guest: what they are drinking, where they are sitting, and one thing they have said.','All three details were correct.'),
('observer','The Pattern','Spot one repeated behavior happening in the room that nobody has mentioned yet and record it before another Trouble player reports the same thing.','You logged a real repeated pattern first.'),

-- ACTOR
('actor','New Obsession','For five minutes, convincingly act extremely interested in a harmless topic another guest brings up. Do not reveal the dare until after the five minutes.','You kept the bit going for five minutes.'),
('actor','What Is That Called?','Pretend you cannot remember the name of one very common household object until somebody outside Trouble finally tells you.','A non-crew guest supplied the obvious word.'),
('actor','False Expertise','Spend one conversation acting as though you know an absurd amount about a harmless everyday topic. Keep it believable enough that nobody calls the bit immediately.','You completed the conversation without breaking character.'),
('actor','The Phrase','Work the phrase “for legal reasons” naturally into three separate conversations without explaining why.','You used the phrase naturally three times.'),
('actor','Temporary Accent','For one short conversation, adopt a clearly playful character voice or mannerism and stay in character until the conversation ends.','You made it through the conversation without breaking.'),

-- SOCIAL ENGINEER
('social_engineer','Coat Migration','Get three people to move their own coat or bag to the same new spot without telling any of them that other people are doing it too.','Three guests independently moved their own item to the same place.'),
('social_engineer','The Empty Chair','Choose one ordinary chair in a common area. Keep it empty for ten consecutive minutes without moving it, blocking it, or telling anyone it is part of a game.','The chair stayed empty for ten minutes.'),
('social_engineer','Look Over There','Get three different people outside Trouble to look through the same window or doorway within five minutes. You may not directly tell them to look there.','Three people looked through the target window or doorway.'),
('social_engineer','Pass It On','Choose one small harmless object already in a common area. Get it from one side of the room to the other through at least three different people. No one person can carry it the entire way.','The object crossed the room through at least three people.'),
('social_engineer','Table Shift','Get three non-crew guests to independently place something on the same table or counter within ten minutes without telling them there is a shared target.','Three separate items arrived at the target surface.'),

-- WILDCARD
('wildcard','The Stack','Collect six clean unused napkins from around the event one at a time and build a neat stack in a visible but unexpected place. Return them later.','Six napkins reached the stack one at a time.'),
('wildcard','One Word','For ten minutes, work the word “allegedly” into as many normal conversations as you can without anyone asking why you keep saying it.','You made it through ten minutes without being called out.'),
('wildcard','The Relay','Get one small harmless object passed through four different people before it returns to you. You may start the chain, but you cannot explain the dare.','The object passed through four people and came back.'),
('wildcard','Three High Fives','Get three different people outside Trouble to high-five you for three different reasons. You may not say “give me a high five.”','You collected three high-fives for three different reasons.'),
('wildcard','Unexpected Formality','Get through one ordinary conversation using absurdly formal language while behaving as if nothing is unusual.','The conversation ended without you breaking the bit.')
;

-- TRUTH BANK --------------------------------------------------------------
insert into public.trouble_truths(prompt) values
('What is a petty opinion you will defend forever?'),
('What is something everybody here probably assumes about you that is wrong?'),
('What is something you have pretended to like because everybody else did?'),
('What are you weirdly competitive about?'),
('What is one thing you have done at a party and hoped nobody noticed?'),
('What harmless lie do you tell all the time because it makes life easier?'),
('Who in this Trouble crew would you trust most with a secret, and why?'),
('What is your most irrational everyday annoyance?'),
('What is something you judge people for even though you know you probably should not?'),
('What is a skill you claim you have that may be slightly exaggerated?'),
('What is the most ridiculous thing you have spent money on?'),
('What is a social rule you secretly think is stupid?'),
('What is one thing you would absolutely refuse to do even for money?'),
('What is the dumbest reason you have ever been annoyed with someone?'),
('What is something you have googled that would look bizarre with no context?'),
('What is something you are much more sensitive about than people realize?'),
('What is one compliment you still remember years later?'),
('What is something you are secretly proud of but almost never mention?'),
('What is a habit you know is annoying but have no plans to stop?'),
('What is one completely harmless thing you have lied about to avoid a conversation?')
on conflict (prompt) do nothing;

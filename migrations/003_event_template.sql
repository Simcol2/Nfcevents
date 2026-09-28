-- TEMPLATE ONLY. Copy this file and replace the example values.
-- This demonstrates how to create another event without touching the Next.js UI.

do $$
declare
  v_event uuid;
  v_prompt uuid;
  v_trivia uuid;
  v_competition_exp uuid;
begin
  insert into public.events (slug, name, subtitle, intro, theme)
  values (
    'example-event-2027',
    'Example Family',
    'Celebration',
    'Choose your experience.',
    '{"cream":"#FFF8EE","paper":"#FFFDF8","ink":"#2E382F","muted":"#7A6D5E","accent":"#A84421","accent2":"#8B2933"}'::jsonb
  )
  returning id into v_event;

  insert into public.experiences (event_id, key, title, description, mode, sort_order)
  values
    (v_event, 'something-fun', 'Something Fun', 'A small social prompt.', 'prompt', 1),
    (v_event, 'trivia', 'Trivia', 'Timed questions with a live leaderboard.', 'trivia', 2),
    (v_event, 'competition', 'Competition', 'Submit an entry and vote later.', 'competition', 3);

  select id into v_prompt from public.experiences where event_id = v_event and key = 'something-fun';
  select id into v_trivia from public.experiences where event_id = v_event and key = 'trivia';
  select id into v_competition_exp from public.experiences where event_id = v_event and key = 'competition';

  insert into public.prompts (experience_id, body, note)
  values
    (v_prompt, 'Put your prompt here.', 'Optional second line.'),
    (v_prompt, 'Add as many prompts as you like.', null);

  insert into public.trivia_questions
    (experience_id, question, answers, correct_index, time_limit_seconds, points_base, speed_bonus_per_second)
  values
    (v_trivia, 'Example question?', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 1, 10, 100, 5);

  insert into public.competitions
    (experience_id, title, prompt, entry_type, minimum_entries, voting_enabled, max_votes_per_device)
  values
    (v_competition_exp, 'Example Competition', 'Submit your entry. Voting opens once three entries are in.', 'text', 3, true, 1);
end $$;

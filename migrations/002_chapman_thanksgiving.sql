-- Adds the Chapman Thanksgiving Dinner as DATA, not hard-coded UI logic.
-- You can duplicate this pattern for future events by changing the slug/name/content.

do $$
declare
  v_event uuid;
  v_holiday uuid;
  v_boost uuid;
  v_challenge uuid;
  v_trouble uuid;
  v_competition uuid;
begin
  insert into public.events (slug, name, subtitle, intro, theme)
  values (
    'chapman-thanksgiving-2026',
    'Chapman',
    'Thanksgiving Dinner',
    'Choose your experience. What are you in need of today?',
    jsonb_build_object(
      'cream', '#FFF8EE',
      'paper', '#FFFDF8',
      'ink', '#2E382F',
      'muted', '#7A6D5E',
      'accent', '#A84421',
      'accent2', '#8B2933'
    )
  )
  on conflict (slug) do update set
    name = excluded.name,
    subtitle = excluded.subtitle,
    intro = excluded.intro,
    theme = excluded.theme,
    active = true
  returning id into v_event;

  insert into public.experiences (event_id, key, title, description, mode, sort_order)
  values
    (v_event, 'holiday-fun', 'A Little Holiday Fun', 'A Thanksgiving moment waiting to happen.', 'prompt', 1),
    (v_event, 'boost', 'A Little Boost', 'A compliment, kindness or little pick-me-up.', 'prompt', 2),
    (v_event, 'challenge', 'A Little Challenge', 'Timed trivia with a live dinner leaderboard.', 'trivia', 3),
    (v_event, 'trouble', 'A Little Trouble', 'A harmless dare. Probably.', 'prompt', 4),
    (v_event, 'competition', 'A Little Competition', 'Enter quietly. Voting opens when enough people participate.', 'competition', 5)
  on conflict (event_id, key) do update set
    title = excluded.title,
    description = excluded.description,
    mode = excluded.mode,
    sort_order = excluded.sort_order;

  select id into v_holiday from public.experiences where event_id = v_event and key = 'holiday-fun';
  select id into v_boost from public.experiences where event_id = v_event and key = 'boost';
  select id into v_challenge from public.experiences where event_id = v_event and key = 'challenge';
  select id into v_trouble from public.experiences where event_id = v_event and key = 'trouble';
  select id into v_competition from public.experiences where event_id = v_event and key = 'competition';

  delete from public.prompts where experience_id in (v_holiday, v_boost, v_trouble);

  insert into public.prompts (experience_id, body, note) values
    (v_holiday, 'Find someone at the table you do not talk to enough.', 'Ask them what became normal this year that they once wished for.'),
    (v_holiday, 'Take a photo of the oldest and youngest person here together.', 'No posing rules. Just make one photo worth keeping.'),
    (v_holiday, 'Choose one person at the table.', 'Ask them for a Thanksgiving memory they have never told you before.'),
    (v_holiday, 'Everybody point at the person most likely to leave with leftovers.', 'Majority vote gets first dessert pick.'),
    (v_holiday, 'Take one photo that feels like this year''s Thanksgiving.', 'Not the prettiest photo. The truest one.'),

    (v_boost, 'Tell someone here what they do that makes gatherings better.', 'Specific beats generic.'),
    (v_boost, 'Think of someone at this table who rarely gets thanked.', 'Fix that.'),
    (v_boost, 'Tell the person across from you something you genuinely admire about them.', 'They are not allowed to argue with the compliment.'),
    (v_boost, 'Someone here makes hard things look easier than they are.', 'Tell them you have noticed.'),
    (v_boost, 'Today''s reminder:', 'You do not have to earn your place at this table. Please proceed directly to dessert.'),

    (v_trouble, 'Start a completely serious debate about the correct amount of gravy.', 'You have sixty seconds to recruit at least one supporter.'),
    (v_trouble, 'Choose someone at the table.', 'Ask them what their first impression of you was.'),
    (v_trouble, 'Trade seats with somebody until dessert.', 'No explanation required.'),
    (v_trouble, 'Convince somebody that one Thanksgiving food is wildly overrated.', 'You may choose violence, but keep it culinary.'),
    (v_trouble, 'Choose the person most likely to know everyone''s business.', 'They must tell one harmless family story.');

  delete from public.trivia_questions where experience_id = v_challenge;

  insert into public.trivia_questions
    (experience_id, question, answers, correct_index, time_limit_seconds, points_base, speed_bonus_per_second)
  values
    (v_challenge, 'Which Canadian province produces the most cranberries?', '["Ontario","British Columbia","Quebec","Nova Scotia"]'::jsonb, 1, 10, 100, 5),
    (v_challenge, 'Pumpkins are technically classified as what?', '["Vegetables","Berries","Roots","Nuts"]'::jsonb, 1, 10, 100, 5),
    (v_challenge, 'Which bird is most associated with Thanksgiving dinner?', '["Duck","Chicken","Turkey","Goose"]'::jsonb, 2, 10, 100, 5),
    (v_challenge, 'What spice is usually NOT part of pumpkin spice?', '["Cinnamon","Nutmeg","Clove","Paprika"]'::jsonb, 3, 10, 100, 5),
    (v_challenge, 'Canadian Thanksgiving is celebrated in which month?', '["September","October","November","December"]'::jsonb, 1, 10, 100, 5);

  insert into public.competitions
    (experience_id, title, prompt, entry_type, minimum_entries, voting_enabled, max_votes_per_device)
  values
    (
      v_competition,
      'Funniest Thanksgiving One-Liner',
      'Submit your best Thanksgiving joke, caption or one-liner. Voting opens once at least three entries are in.',
      'text',
      3,
      true,
      1
    )
  on conflict (experience_id) do update set
    title = excluded.title,
    prompt = excluded.prompt,
    entry_type = excluded.entry_type,
    minimum_entries = excluded.minimum_entries,
    voting_enabled = excluded.voting_enabled,
    max_votes_per_device = excluded.max_votes_per_device;
end $$;

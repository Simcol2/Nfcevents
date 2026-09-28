-- Turns Chapman's "A Little Trouble" into a scenario experience.
-- Requires 007_scenario_mode.sql.
--
-- scenario_outcome options:
--   conversation = discuss only; nothing is submitted
--   share        = groups may save plans for the host to read aloud later
--   vote         = save plans and open guest voting after the configured minimum

do $$
declare
  v_event uuid;
  v_trouble uuid;
begin
  select id into v_event from public.events where slug = 'chapman-thanksgiving-2026';
  select id into v_trouble from public.experiences where event_id = v_event and key = 'trouble';

  update public.experiences
  set
    mode = 'scenario',
    description = 'A scenario that gives the table something better to discuss than the weather.',
    config = jsonb_build_object(
      'scenario_outcome', 'conversation',
      'scenario_minimum_entries', 3,
      'scenario_instruction', 'Use only skills someone in your group actually has. If nobody at the table can drive, you do not have a getaway driver.',
      'scenario_share_message', 'Your plan is saved. The host can read the plans aloud later.',
      'scenario_vote_message', 'Once enough plans are in, everyone can vote for the best one.'
    )
  where id = v_trouble;

  delete from public.prompts where experience_id = v_trouble;

  insert into public.prompts (experience_id, body, note) values
    (v_trouble, 'You have been kidnapped. There is only one way out: your group has to execute the perfect bank robbery. What is the plan?', 'Assign every role using only real skills available in your group. No imaginary getaway driver if nobody here can drive.'),
    (v_trouble, 'Your group has to escape from a high-security museum after accidentally getting locked inside overnight. How are you getting out?', 'Use only knowledge, abilities and resources somebody in your group could realistically contribute.'),
    (v_trouble, 'Aliens have arrived and your group has one hour to convince them not to destroy Earth. What is your strategy?', 'Every part of the plan has to be carried out by someone at the table using a skill they actually have.'),
    (v_trouble, 'You are all stranded after your boat disappears. Rescue is five days away. Build the survival plan.', 'Assign jobs based only on what people in the group genuinely know how to do.'),
    (v_trouble, 'Your family has been recruited for an elaborate heist movie. The mission is impossible unless everyone has a role. Build the team and the plan.', 'No invented talents. Your plan can only use skills somebody in the group actually possesses.');
end $$;

-- Adds the guided bank-heist builder to Chapman's A Little Trouble.
-- The scenario remains explicitly fictional and uses only non-operational party-game choices.

do $block$
declare
  v_event uuid;
  v_trouble uuid;
begin
  select id into v_event from public.events where slug = 'chapman-thanksgiving-2026';
  select id into v_trouble from public.experiences where event_id = v_event and key = 'trouble';

  update public.experiences
  set
    description = 'A ridiculous scenario your table has to solve using only the skills actually sitting at the table.',
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'scenario_outcome', 'share',
      'scenario_minimum_entries', 3,
      'scenario_instruction', 'Use only skills someone in your group actually has. If nobody at the table can drive, you do not have a getaway driver.'
    )
  where id = v_trouble;

  update public.prompts
  set builder = $json$
  {
    "title": "Build the heist",
    "roles": [
      {"key":"mastermind","label":"Mastermind","description":"Keeps the plan together."},
      {"key":"driver","label":"Driver","description":"Only assign this if someone can actually drive."},
      {"key":"lookout","label":"Lookout","description":"Notices trouble before everyone else does."},
      {"key":"talker","label":"Talker","description":"The person you trust to keep a straight face."},
      {"key":"tech","label":"Tech","description":"Handles whatever the group genuinely knows how to handle."},
      {"key":"distraction","label":"Distraction","description":"Creates chaos without needing a useful skill."}
    ],
    "fields": [
      {"key":"date","section":"Timing","label":"When does your fictional robbery happen?","type":"date","required":true},
      {"key":"transport","section":"Transport","label":"How are you getting there and leaving?","type":"text","required":true,"placeholder":"Use something your group could actually operate."},
      {"key":"equipment","section":"Equipment","label":"What are you bringing?","type":"multiselect","required":true,"options":["Disguises","Radios","Bags","Decoy props","Printed maps","Snacks because someone planned poorly","No special equipment"]},
      {"key":"threats","section":"Threat level","label":"What kind of intimidation exists in this fictional plan?","type":"select","required":true,"options":["None","Bluff only / no real weapons","Ridiculous movie-prop threat only"]},
      {"key":"hostages","section":"Bystanders","label":"Are you taking hostages in the story?","type":"select","required":true,"options":["No hostages","Yes in the fictional story, but nobody is harmed"]},
      {"key":"opening","section":"Phase 1","label":"How does the operation begin?","type":"textarea","required":true,"placeholder":"Describe the opening scene like a movie, not real-world instructions."},
      {"key":"inside","section":"Phase 2","label":"What happens once your crew is inside?","type":"textarea","required":true,"placeholder":"Who does what? Keep it fictional and use only the skills at your table."},
      {"key":"exit","section":"Phase 3","label":"How does your crew get out?","type":"textarea","required":true,"placeholder":"Tell the story version of the escape."},
      {"key":"after","section":"Aftermath","label":"What does the crew do afterward?","type":"textarea","required":true,"placeholder":"Where does everyone go and how do you celebrate getting away with it?"}
    ]
  }
  $json$::jsonb
  where experience_id = v_trouble
    and body ilike '%perfect bank robbery%';
end $block$;

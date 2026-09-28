-- Chapman Thanksgiving trivia board.
--
-- Point values: 1 = easy, 2 = medium, 5 = hard.
-- sort_order sets the order questions are served inside each category/value,
-- so every guest gets the same questions in the same sequence.
-- correct_index is 0-based: 0 = first answer, 3 = fourth answer.
--
-- CHAPMAN FAMILY STATS questions are PLACEHOLDERS. Replace them with real
-- family questions before the dinner (see README, "Editing trivia questions").

do $$
declare
  v_event uuid;
  v_challenge uuid;
begin
  select id into v_event from public.events where slug = 'chapman-thanksgiving-2026';
  select id into v_challenge from public.experiences where event_id = v_event and key = 'challenge';

  update public.experiences
  set
    description = 'Pick a category and a point value. Two hours on the clock.',
    config = jsonb_build_object(
      'duration_minutes', 120,
      -- Optional hard stop, e.g. '2026-10-11T21:00:00-04:00'. null = no hard stop.
      'hard_end_at', null,
      'point_values', jsonb_build_array(1, 2, 5),
      'categories', jsonb_build_array(
        jsonb_build_object('key', 'chapman', 'label', 'Chapman Family Stats'),
        jsonb_build_object('key', 'thanksgiving', 'label', 'Thanksgiving Facts'),
        jsonb_build_object('key', 'general', 'label', 'General Knowledge'),
        jsonb_build_object('key', 'grade5', 'label', '5th Grade'),
        jsonb_build_object('key', 'grade9', 'label', '9th Grade')
      )
    )
  where id = v_challenge;

  delete from public.trivia_questions where experience_id = v_challenge;

  insert into public.trivia_questions (experience_id, category, points, sort_order, question, answers, correct_index)
  values
    -- Chapman Family Stats (PLACEHOLDERS: replace before the dinner)
    (v_challenge, 'chapman', 1, 1, '[PLACEHOLDER] Easy family question #1', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 0),
    (v_challenge, 'chapman', 1, 2, '[PLACEHOLDER] Easy family question #2', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 0),
    (v_challenge, 'chapman', 2, 1, '[PLACEHOLDER] Medium family question #1', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 0),
    (v_challenge, 'chapman', 2, 2, '[PLACEHOLDER] Medium family question #2', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 0),
    (v_challenge, 'chapman', 5, 1, '[PLACEHOLDER] Hard family question #1', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 0),
    (v_challenge, 'chapman', 5, 2, '[PLACEHOLDER] Hard family question #2', '["Answer A","Answer B","Answer C","Answer D"]'::jsonb, 0),

    -- Thanksgiving Facts
    (v_challenge, 'thanksgiving', 1, 1, 'Canadian Thanksgiving falls on which Monday in October?', '["First","Second","Third","Last"]'::jsonb, 1),
    (v_challenge, 'thanksgiving', 1, 2, 'Which country celebrates Thanksgiving on the fourth Thursday of November?', '["United Kingdom","Australia","United States","Ireland"]'::jsonb, 2),
    (v_challenge, 'thanksgiving', 1, 3, 'Which bird is most associated with Thanksgiving dinner?', '["Turkey","Duck","Goose","Chicken"]'::jsonb, 0),
    (v_challenge, 'thanksgiving', 1, 4, 'Cranberries are commercially grown in what?', '["Orchards","Greenhouses","Rice paddies","Bogs"]'::jsonb, 3),
    (v_challenge, 'thanksgiving', 1, 5, 'What is the main ingredient in classic Thanksgiving stuffing?', '["Rice","Bread","Potatoes","Pasta"]'::jsonb, 1),

    (v_challenge, 'thanksgiving', 2, 1, 'The famous Thanksgiving Day parade run by Macy''s takes place in which city?', '["Chicago","Boston","New York City","Philadelphia"]'::jsonb, 2),
    (v_challenge, 'thanksgiving', 2, 2, 'Wild turkeys are native to which continent?', '["North America","Europe","Africa","Asia"]'::jsonb, 0),
    (v_challenge, 'thanksgiving', 2, 3, 'What is an adult male turkey called?', '["Hen","Drake","Poult","Tom"]'::jsonb, 3),
    (v_challenge, 'thanksgiving', 2, 4, 'Each year the U.S. president spares a turkey in a ceremony called what?', '["The Blessing","The Pardon","The Release","The Toast"]'::jsonb, 1),
    (v_challenge, 'thanksgiving', 2, 5, 'What crunchy topping goes on a classic green bean casserole?', '["Fried onions","Croutons","Crushed crackers","Bacon bits"]'::jsonb, 0),

    (v_challenge, 'thanksgiving', 5, 1, 'Which U.S. president proclaimed a national day of Thanksgiving in 1863?', '["George Washington","Thomas Jefferson","Abraham Lincoln","Ulysses S. Grant"]'::jsonb, 2),
    (v_challenge, 'thanksgiving', 5, 2, 'In what year did Canada''s Parliament fix Thanksgiving on the second Monday of October?', '["1879","1921","1931","1957"]'::jsonb, 3),
    (v_challenge, 'thanksgiving', 5, 3, 'Which English explorer held a thanksgiving ceremony in Canada''s Arctic in 1578?', '["Martin Frobisher","Henry Hudson","John Cabot","James Cook"]'::jsonb, 0),
    (v_challenge, 'thanksgiving', 5, 4, 'Which writer campaigned for 17 years to make Thanksgiving a U.S. national holiday?', '["Louisa May Alcott","Sarah Josepha Hale","Harriet Beecher Stowe","Emily Dickinson"]'::jsonb, 1),
    (v_challenge, 'thanksgiving', 5, 5, 'Which NFL team has hosted a Thanksgiving Day game almost every year since 1934?', '["Dallas Cowboys","Green Bay Packers","Chicago Bears","Detroit Lions"]'::jsonb, 3),

    -- General Knowledge
    (v_challenge, 'general', 1, 1, 'What is the capital of Canada?', '["Toronto","Ottawa","Montreal","Vancouver"]'::jsonb, 1),
    (v_challenge, 'general', 1, 2, 'What is the largest planet in our solar system?', '["Jupiter","Saturn","Neptune","Earth"]'::jsonb, 0),
    (v_challenge, 'general', 1, 3, 'How many continents are there?', '["Five","Six","Seven","Eight"]'::jsonb, 2),
    (v_challenge, 'general', 1, 4, 'Which gas do plants take in from the air to make food?', '["Oxygen","Nitrogen","Helium","Carbon dioxide"]'::jsonb, 3),
    (v_challenge, 'general', 1, 5, 'At what temperature does water freeze, in degrees Celsius?', '["0","32","10","-10"]'::jsonb, 0),

    (v_challenge, 'general', 2, 1, 'Which element has the chemical symbol Au?', '["Silver","Aluminum","Gold","Argon"]'::jsonb, 2),
    (v_challenge, 'general', 2, 2, 'Who painted the Mona Lisa?', '["Michelangelo","Leonardo da Vinci","Raphael","Vincent van Gogh"]'::jsonb, 1),
    (v_challenge, 'general', 2, 3, 'What is the largest ocean on Earth?', '["Atlantic","Indian","Arctic","Pacific"]'::jsonb, 3),
    (v_challenge, 'general', 2, 4, 'Which country has the largest population?', '["India","China","United States","Indonesia"]'::jsonb, 0),
    (v_challenge, 'general', 2, 5, 'How many bones are in the adult human body?', '["106","156","206","306"]'::jsonb, 2),

    (v_challenge, 'general', 5, 1, 'In what year did the Berlin Wall fall?', '["1985","1989","1991","1993"]'::jsonb, 1),
    (v_challenge, 'general', 5, 2, 'What is the capital of Australia?', '["Sydney","Melbourne","Perth","Canberra"]'::jsonb, 3),
    (v_challenge, 'general', 5, 3, 'Which language has the most native speakers in the world?', '["Mandarin Chinese","English","Spanish","Hindi"]'::jsonb, 0),
    (v_challenge, 'general', 5, 4, 'Who wrote Pride and Prejudice?', '["Charlotte Bronte","Mary Shelley","Jane Austen","Virginia Woolf"]'::jsonb, 2),
    (v_challenge, 'general', 5, 5, 'What is the only mammal capable of true flight?', '["Flying squirrel","Bat","Sugar glider","Colugo"]'::jsonb, 1),

    -- 5th Grade
    (v_challenge, 'grade5', 1, 1, 'What is 7 x 8?', '["54","56","58","64"]'::jsonb, 1),
    (v_challenge, 'grade5', 1, 2, 'How many sides does a hexagon have?', '["5","6","7","8"]'::jsonb, 1),
    (v_challenge, 'grade5', 1, 3, 'Which planet is closest to the Sun?', '["Venus","Mars","Mercury","Earth"]'::jsonb, 2),
    (v_challenge, 'grade5', 1, 4, 'How many provinces does Canada have?', '["10","12","13","8"]'::jsonb, 0),
    (v_challenge, 'grade5', 1, 5, 'At sea level, water boils at how many degrees Celsius?', '["90","212","120","100"]'::jsonb, 3),

    (v_challenge, 'grade5', 2, 1, 'What is 3/4 written as a decimal?', '["0.34","0.75","0.43","0.7"]'::jsonb, 1),
    (v_challenge, 'grade5', 2, 2, 'What process do plants use to make food from sunlight?', '["Photosynthesis","Respiration","Evaporation","Pollination"]'::jsonb, 0),
    (v_challenge, 'grade5', 2, 3, 'Which is Canada''s largest province by area?', '["Ontario","British Columbia","Alberta","Quebec"]'::jsonb, 3),
    (v_challenge, 'grade5', 2, 4, 'What is the perimeter of a square with 6 cm sides?', '["12 cm","36 cm","24 cm","18 cm"]'::jsonb, 2),
    (v_challenge, 'grade5', 2, 5, 'Which layer of the Earth do we live on?', '["Mantle","Crust","Outer core","Inner core"]'::jsonb, 1),

    (v_challenge, 'grade5', 5, 1, 'What is the smallest prime number?', '["0","1","2","3"]'::jsonb, 2),
    (v_challenge, 'grade5', 5, 2, 'What is 12 x 12?', '["144","124","132","156"]'::jsonb, 0),
    (v_challenge, 'grade5', 5, 3, 'Which gas makes up most of Earth''s atmosphere?', '["Oxygen","Carbon dioxide","Argon","Nitrogen"]'::jsonb, 3),
    (v_challenge, 'grade5', 5, 4, 'The three angles of a triangle add up to how many degrees?', '["90","180","270","360"]'::jsonb, 1),
    (v_challenge, 'grade5', 5, 5, 'What is the capital of Nunavut?', '["Yellowknife","Whitehorse","Iqaluit","Rankin Inlet"]'::jsonb, 2),

    -- 9th Grade
    (v_challenge, 'grade9', 1, 1, 'Solve for x: 2x + 3 = 11', '["3","4","5","7"]'::jsonb, 1),
    (v_challenge, 'grade9', 1, 2, 'What is the chemical formula for water?', '["CO2","O2","H2O","NaCl"]'::jsonb, 2),
    (v_challenge, 'grade9', 1, 3, 'Which part of the cell is known as its powerhouse?', '["Mitochondria","Nucleus","Ribosome","Cell wall"]'::jsonb, 0),
    (v_challenge, 'grade9', 1, 4, 'Which of these is a prime number?', '["15","21","27","17"]'::jsonb, 3),
    (v_challenge, 'grade9', 1, 5, 'What is the square root of 81?', '["8","9","7","81"]'::jsonb, 1),

    (v_challenge, 'grade9', 2, 1, 'Which formula gives the area of a circle?', '["2πr","πd","πr²","r²"]'::jsonb, 2),
    (v_challenge, 'grade9', 2, 2, 'Which particle in an atom has a negative charge?', '["Proton","Electron","Neutron","Nucleus"]'::jsonb, 1),
    (v_challenge, 'grade9', 2, 3, 'In what year did Canadian Confederation take place?', '["1867","1812","1885","1905"]'::jsonb, 0),
    (v_challenge, 'grade9', 2, 4, 'What is the slope of the line y = 3x - 5?', '["-5","5","-3","3"]'::jsonb, 3),
    (v_challenge, 'grade9', 2, 5, 'In which Italian city is Romeo and Juliet set?', '["Venice","Rome","Verona","Florence"]'::jsonb, 2),

    (v_challenge, 'grade9', 5, 1, 'A right triangle has legs of 6 and 8. How long is the hypotenuse?', '["10","12","14","48"]'::jsonb, 0),
    (v_challenge, 'grade9', 5, 2, 'Newton''s second law of motion is usually written as what?', '["E = mc²","F = ma","V = IR","P = mv"]'::jsonb, 1),
    (v_challenge, 'grade9', 5, 3, 'What is the chemical symbol for sodium?', '["So","Sd","S","Na"]'::jsonb, 3),
    (v_challenge, 'grade9', 5, 4, 'Who was Canada''s first prime minister?', '["Wilfrid Laurier","George-Etienne Cartier","John A. Macdonald","Alexander Mackenzie"]'::jsonb, 2),
    (v_challenge, 'grade9', 5, 5, 'What is (2³)²?', '["32","64","12","36"]'::jsonb, 1);
end $$;

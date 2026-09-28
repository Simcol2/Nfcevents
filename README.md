# Interactive Event Experiences

A mobile-first NFC event experience app built for **Vercel + Next.js + Supabase**.

The app is intentionally **event-driven rather than Chapman-hard-coded**. The route is:

```text
/e/[event-slug]
```

The Chapman Thanksgiving Dinner is included as a **database seed migration** at:

```text
migrations/002_chapman_thanksgiving.sql
```

After setup, its URL will be:

```text
https://YOUR-DOMAIN.vercel.app/e/chapman-thanksgiving-2026
```

Program that URL into the NFC tags in the centerpieces.

---

## What is already functional

### Shared event state
All guests use the same Supabase database. Nothing important is isolated to one phone.

### Prompt experiences
The event seed includes:

- A Little Holiday Fun
- A Little Boost
- A Little Trouble

Holiday Fun and Boost pull random prompts from the database. **A Little Trouble now uses scenario mode:** the group receives an absurd scenario and must solve it using only skills genuinely available among the people playing. The host decides whether scenarios are conversation-only, saved for later read-aloud, or submitted for voting.

### Jeopardy-style trivia board
A Little Challenge works like a Jeopardy board:

- guests pick a **category** and a **point value** (1, 2 or 5)
- questions are **not timed**; the whole activity is
- a **2-hour countdown** starts when anyone answers the first question
- guests keep playing until time runs out
- inside each category/value, everyone gets the same questions in the same order
- wrong answers score 0
- leaving the screen during a question (switching apps, locking the phone, reloading) makes it **disappear** and score 0
- the leaderboard shows the overall leader and each category's leader, then the **winners** once time is up

See "Trivia board" below for how it is protected against cheating.

### Competition system
A Little Competition supports either:

- `text` entries, such as jokes/captions
- `photo` entries, uploaded to Supabase Storage

The competition has a configurable minimum number of entries. Voting stays closed until that threshold is met. The Chapman seed uses a minimum of **3**.

Voting is shared across all guests. Each browser/device receives a random device token used only to enforce the configured vote limit.

---

# 1. Create a Supabase project

Create a project at Supabase, then open the SQL Editor.

Run these files **in order**:

```text
migrations/001_schema.sql
migrations/002_chapman_thanksgiving.sql
migrations/004_view_security_invoker.sql
migrations/005_board_trivia.sql
migrations/006_chapman_board_trivia.sql
migrations/007_scenario_mode.sql
migrations/008_chapman_trouble_scenarios.sql
migrations/009_scenario_builder.sql
migrations/010_chapman_heist_builder.sql
migrations/011_trouble_crew_lock.sql
```

(`003_event_template.sql` is a template for new events, not part of the Chapman setup.)

`001_schema.sql` creates:

- events
- experiences
- prompts
- trivia questions (reshaped for the board by `005_board_trivia.sql`)
- competitions
- competition entries
- competition votes
- a public Supabase Storage bucket for competition photos
- Realtime publication entries

`002_chapman_thanksgiving.sql` adds the Chapman Thanksgiving Dinner as database content.

---

# 2. Add environment variables

Copy:

```text
.env.example
```

to:

```text
.env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

You can find these in Supabase project settings.

## Important

`SUPABASE_SERVICE_ROLE_KEY` is server-only.

**Never** rename it to begin with `NEXT_PUBLIC_`, put it in browser code, or commit it to GitHub.

The service-role key is used only in Next.js route handlers on Vercel.

---

# 3. Run locally

```bash
npm install
npm run dev
```

Then visit:

```text
http://localhost:3000/e/chapman-thanksgiving-2026
```

Open the same URL on multiple phones/browsers to test the shared leaderboard and competition state.

---

# 4. Deploy to Vercel

Push this folder to GitHub and import the repository into Vercel.

Add the same three environment variables in:

```text
Vercel project → Settings → Environment Variables
```

Deploy.

Your NFC URL will then be something like:

```text
https://your-project.vercel.app/e/chapman-thanksgiving-2026
```

If you later attach a custom domain, reprogram the NFC tags with the permanent URL.

---

# How event customization works

Nothing in the UI says “Chapman Thanksgiving” because the React component decided it should.

The page reads the following from Supabase:

```text
event
  ↓
experiences
  ├── prompts
  ├── trivia questions
  └── competition configuration
```

That means the same deployed code can serve:

```text
/e/chapman-thanksgiving-2026
/e/smith-baby-shower-2027
/e/jordan-40th-birthday
/e/company-holiday-party
```

without creating a separate app for each event.

---

# Adding another event

Use `migrations/003_event_template.sql` as a starting point.

The key pieces are:

## Event

```sql
insert into public.events (slug, name, subtitle, intro, theme)
values (...);
```

## Experiences

Each event can have any combination of:

```text
prompt
trivia
competition
```

The visible labels are database data, so they do not have to be “A Little…” at every event.

## Competition configuration

A competition can be switched between text and photo without changing the app code:

```sql
entry_type = 'text'
```

or:

```sql
entry_type = 'photo'
```

You can also change:

```text
minimum_entries
voting_enabled
max_votes_per_device
```

---

# Current Chapman setup

The Chapman seed currently creates:

### A Little Holiday Fun
Thanksgiving/family memory prompts.

### A Little Boost
Compliments and small social kindness prompts.

### A Little Challenge
A trivia board with five categories: Chapman Family Stats, Thanksgiving Facts,
General Knowledge, 5th Grade and 9th Grade. Each has 1, 2 and 5 point questions.

**Chapman Family Stats are placeholders.** Replace them before the dinner (see "Editing trivia questions").

### A Little Trouble
Scenario mode: absurd scenarios the group solves using only skills people at the table genuinely have.
See "A Little Trouble: scenario mode" below.

### A Little Competition
A shared text competition called:

```text
Funniest Thanksgiving One-Liner
```

Voting opens once **3 entries** have been submitted.

To test the photo version instead, edit the competition row in Supabase:

```sql
update public.competitions
set
  title = 'Thanksgiving Photo Challenge',
  prompt = 'Take the most dramatically serious family portrait you can. Upload it here. Voting opens once at least three entries are in.',
  entry_type = 'photo',
  minimum_entries = 3
where experience_id = (
  select x.id
  from public.experiences x
  join public.events e on e.id = x.event_id
  where e.slug = 'chapman-thanksgiving-2026'
    and x.key = 'competition'
);
```

No frontend code changes are required.

---

# Realtime behavior

The browser subscribes to changes in:

```text
competition_entries
competition_votes
scenario_entries
scenario_votes
```

When another guest submits an entry, plan or vote, open event pages reload the current shared event data.
The trivia board refreshes its leaderboard every 15 seconds instead, because trivia tables are
deliberately not readable from the browser.

This means:

- the leaderboard is shared
- the entry count is shared
- voting opens for everyone once the minimum is met
- vote totals are shared

---

# Photo uploads

Photo competition uploads go to the Supabase Storage bucket:

```text
competition-uploads
```

The included schema creates this as a **public bucket** so images can render directly in the voting page.

For a private/client production version, you may eventually prefer private storage with signed URLs.

The current upload endpoint accepts:

```text
JPEG
PNG
WebP
HEIC / HEIF
```

up to **8 MB** per image.

---

# About the device token

The only important use of `localStorage` in this app is a random anonymous device ID.

It is **not** where event data lives.

The shared event data lives in Supabase.

The device token is used to prevent the same browser/device from casting more votes than `max_votes_per_device` permits.

For a family dinner this is usually enough. For high-value prizes, replace this with stronger guest identity/rate-limiting rules.

---

# Trivia board

## How the clock works

Trivia settings live in the `config` column of the trivia experience:

```json
{
  "duration_minutes": 120,
  "hard_end_at": null,
  "point_values": [1, 2, 5],
  "categories": [{ "key": "chapman", "label": "Chapman Family Stats" }]
}
```

- The countdown starts the moment **anyone answers** their first question.
- It lasts `duration_minutes`.
- `hard_end_at` is an optional backstop, for example `"2026-10-11T21:00:00-04:00"`.
  Trivia closes at whichever comes first.

## Anti-cheat

- Correct answers never leave the server. The browser never receives them, and the
  public Supabase key cannot read the trivia tables.
- Scores are calculated on the server. The browser cannot submit a score.
- A question can only be revealed once per guest. Leaving the screen, reloading, or
  opening another question forfeits it for 0 points.
- After answering, guests only see "Correct" or "Not this time", not the right answer,
  so answers are not passed around the table.

Limits worth knowing: a guest could still use a second phone to look things up, or
open trivia in a private browser tab (which counts as a new player) to preview the
next question. For a family dinner this is a reasonable trade-off.

## Editing trivia questions

Edit rows in Supabase: **Table Editor → trivia_questions**.

- `category`: one of `chapman`, `thanksgiving`, `general`, `grade5`, `grade9`
- `points`: 1, 2 or 5
- `sort_order`: the order questions are served in within that category/value
- `answers`: a JSON list, for example `["A","B","C","D"]`
- `correct_index`: position of the right answer, **starting at 0** (0 = first)

Add more rows to any category/value to give guests more to play.

## Resetting before the real event

Testing starts the clock. To reset trivia before the dinner, run in the SQL Editor:

```sql
delete from public.trivia_attempts;
delete from public.trivia_players;
```

---

# NFC setup

The centerpiece itself needs no electronics beyond a passive NFC tag.

Program the tag with the event URL:

```text
https://YOUR-DOMAIN/e/chapman-thanksgiving-2026
```

Guest flow:

```text
Tap centerpiece
      ↓
Event page opens
      ↓
Choose experience
      ↓
Prompt / trivia / competition
```

If the NFC tag is mounted directly onto metal, use an **on-metal NFC tag** or a suitable ferrite isolation layer.

---

# Suggested next additions

The database structure is deliberately ready to grow into the wall concept later. Natural next additions are:

- configurable prizes
- one-use prize claims
- event admin page
- host-editable prompts
- multiple simultaneous competitions per event
- light-wall webhook/action after a guest tap
- WLED/Home Assistant/ESP32 integrations
- QR fallback beside NFC
- analytics showing which experiences were chosen
- moderation/approval for public photo entries

The centerpiece app and future interactive wall can therefore use the **same event backend**, rather than becoming two unrelated systems.

---

# A Little Trouble: scenario mode

`A Little Trouble` is now a reusable `scenario` experience rather than a simple dare prompt.

Every scenario shows the rule:

> **Use only skills someone in your group actually has.**

For Chapman the fuller instruction is:

> Use only skills someone in your group actually has. If nobody at the table can drive, you do not have a getaway driver.

The scenarios themselves are still stored in `public.prompts`, so adding or changing them does not require a frontend deployment.

## Host controls the format

Set `experiences.config.scenario_outcome` to one of:

```text
conversation
share
vote
```

### `conversation`

The scenario exists only to get the table talking. Nothing is submitted and there is no winner.

### `share`

Groups can submit their plan. Everyone shares the same Supabase state, and the host can choose to read plans aloud later.

### `vote`

Groups submit plans. Voting opens after `scenario_minimum_entries` submissions for that scenario (enforced on the server). Each device gets one vote per scenario.

Example configuration:

```sql
update public.experiences
set config = jsonb_build_object(
  'scenario_outcome', 'vote',
  'scenario_minimum_entries', 3,
  'scenario_instruction', 'Use only skills someone in your group actually has. If nobody can drive, you do not have a getaway driver.',
  'scenario_share_message', 'Your plan is saved. The host can read the plans aloud later.',
  'scenario_vote_message', 'Once enough plans are in, everyone can vote for the best one.'
)
where event_id = (select id from public.events where slug = 'chapman-thanksgiving-2026')
  and key = 'trouble';
```

The new shared tables are:

```text
scenario_entries
scenario_votes
scenario_entry_results
```

They use Supabase Realtime just like competitions, so submitted plans and votes update across guests' phones.

---

# Guided scenario builder (the bank heist)

A scenario prompt can carry a `builder` (JSON in `prompts.builder`). When it does, the
group is walked through the plan step by step instead of getting one big text box:

1. Crew or table name (required; it appears in the final report)
2. Assign roles (Mastermind, Driver, Lookout, Talker, Tech, Distraction). Leave a role
   blank if nobody at the table can genuinely do it.
3. One screen per planning question (date, transport, equipment, threat level,
   bystanders, then the opening, inside and exit phases, and the aftermath)
4. Review, then "Lock in our plan"

On submission the server randomly turns the plan into either a **breaking-news report**
or a **police incident report**, saved with the entry so the host can read it aloud.

- The server only stores the roles and fields the builder defines, trims every answer,
  and rejects the plan if a required step is missing.
- Unfinished plans are saved on the phone, so a group can leave and pick up where it left off.
- Scenarios **without** a builder keep the host's `scenario_outcome` setting
  (conversation, share or vote) with a single free-text plan and no generated report.

In Chapman, only the bank-robbery scenario has a builder (`010_chapman_heist_builder.sql`).
That migration also switches A Little Trouble to `share`, so the other four scenarios offer
a plan box. Set `scenario_outcome` back to `conversation` if you prefer talk-only for them.

---

# One experience per guest, and the Trouble crew

## Category lock

The home screen asks **What do you feel like tonight?** A guest picks one experience,
enters their name and confirms. The server records that choice in `event_participants`
(one row per device per event) and refuses any later attempt to pick a different one.
If a guest refreshes or comes back later, the app asks the server and reopens their
experience automatically.

`event_participants` is readable by the browser for the live crew lobby, so it stores
a SHA-256 **hash** of the device token, never the token itself.

## A Little Trouble crew

Experiences whose config has `trouble_roles` use the crew game:

1. **Lobby:** everyone who chose Trouble appears. Anyone can tap *Everyone's here, lock the crew*
   once `trouble_min_crew` (default 2) people are in.
2. **Voting:** the host's mission (`trouble_prompt_id`) appears. Each person votes who best fits
   each role, themselves included. When everyone has voted, the server assigns one role per person
   to maximise the crew's total votes. Exact ties resolve by search order.
3. **Planning:** each person gets their role's prompt and one constraint, and types or dictates
   (browser voice-to-text where supported) their part.
4. **Review:** once every part is in, a plain combined plan is built in role order. Everyone approves.
5. **Submitted** after the last approval. Editing a part during review resets approvals.

Crew size is capped at the number of roles (6 for Chapman). Once the crew is locked, or when it is
full, new guests are told to choose another experience instead of joining a game that cannot
include them.

To change the mission, set `experiences.config.trouble_prompt_id` to another Trouble prompt.
Scenario experiences **without** `trouble_roles` still use the guided builder / free-text flow.

## Resetting before the real event

```sql
delete from public.trouble_sessions;      -- also clears votes, roles and plan pieces
delete from public.event_participants;    -- unlocks every guest's category choice
```

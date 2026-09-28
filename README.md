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

Each pulls a random prompt from the database.

### Live timed trivia
A Little Challenge includes:

- timed questions
- speed-based points
- score submission to Supabase
- a **real shared leaderboard**
- Supabase Realtime refreshes when scores change

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
```

`001_schema.sql` creates:

- events
- experiences
- prompts
- trivia questions
- trivia scores
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
Five timed trivia questions with a live leaderboard.

### A Little Trouble
Low-stakes dares.

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
trivia_scores
competition_entries
competition_votes
```

When another guest submits a score, entry, or vote, open event pages reload the current shared event data.

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

# Before using prizes with real monetary value

This starter is appropriate for a party prototype, but do not attach expensive prizes to client-side trivia scores without adding server-side verification.

Currently the browser calculates the trivia score and submits the final score. A guest who deliberately manipulates requests could theoretically fake one.

For a future prize-bearing version, submit:

- question IDs
- chosen answers
- response times

and calculate the final score in the server route.

Similarly, for valuable prize competitions, add stronger identity/rate limiting than the anonymous device token.

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

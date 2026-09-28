-- Adds structured, step-by-step scenario builders and generated summaries.

alter table public.prompts
  add column if not exists builder jsonb;

alter table public.scenario_entries
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists summary_style text,
  add column if not exists summary_text text;

alter table public.scenario_entries
  drop constraint if exists scenario_entries_summary_style_check;

alter table public.scenario_entries
  add constraint scenario_entries_summary_style_check
  check (summary_style is null or summary_style in ('news','police'));

-- New columns sit in the middle of the view, so it has to be recreated.
drop view if exists public.scenario_entry_results;

create view public.scenario_entry_results
with (security_invoker = true) as
select
  e.id,
  e.event_id,
  e.experience_id,
  e.prompt_id,
  e.group_name,
  e.plan,
  e.answers,
  e.summary_style,
  e.summary_text,
  e.created_at,
  count(v.id)::int as votes
from public.scenario_entries e
left join public.scenario_votes v on v.entry_id = e.id
group by e.id;

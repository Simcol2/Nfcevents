-- The funny version of the crew's approved plan, generated when the last
-- crew member approves: a breaking-news report or a police incident report.
alter table public.trouble_sessions
  add column if not exists report_style text,
  add column if not exists report_text text;

alter table public.trouble_sessions
  drop constraint if exists trouble_sessions_report_style_check;
alter table public.trouble_sessions
  add constraint trouble_sessions_report_style_check
  check (report_style is null or report_style in ('news','police'));

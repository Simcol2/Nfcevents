-- Make the results view respect the querying user's RLS policies
-- (fixes the Supabase "Security Definer View" advisor error).
alter view public.competition_entry_results set (security_invoker = true);

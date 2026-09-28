import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { eventId, experienceId, promptId, groupName, plan } = body ?? {};

  if (!eventId || !experienceId || !promptId || !String(plan ?? '').trim()) {
    return NextResponse.json({ error: 'Plan is empty.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Only accept plans for a real scenario prompt whose host allows submissions.
  const [{ data: experience }, { data: prompt }] = await Promise.all([
    supabase.from('experiences').select('event_id,mode,config').eq('id', experienceId).maybeSingle(),
    supabase.from('prompts').select('experience_id').eq('id', promptId).maybeSingle(),
  ]);
  const outcome = experience?.config?.scenario_outcome;
  if (!experience || experience.mode !== 'scenario' || experience.event_id !== eventId || prompt?.experience_id !== experienceId) {
    return NextResponse.json({ error: 'Scenario not found.' }, { status: 404 });
  }
  if (outcome !== 'share' && outcome !== 'vote') {
    return NextResponse.json({ error: 'This scenario is for conversation only.' }, { status: 400 });
  }

  const { error } = await supabase.from('scenario_entries').insert({
    event_id: eventId,
    experience_id: experienceId,
    prompt_id: promptId,
    group_name: String(groupName ?? '').trim().slice(0, 40) || null,
    plan: String(plan ?? '').trim().slice(0, 1600),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

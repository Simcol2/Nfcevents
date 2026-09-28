import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { entryId, experienceId, promptId, deviceToken } = body ?? {};

  if (!entryId || !experienceId || !promptId || !deviceToken) {
    return NextResponse.json({ error: 'Invalid vote.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: experience, error: expError } = await supabase
    .from('experiences')
    .select('config')
    .eq('id', experienceId)
    .single();

  if (expError || !experience || experience.config?.scenario_outcome !== 'vote') {
    return NextResponse.json({ error: 'Voting is not enabled for this scenario experience.' }, { status: 400 });
  }

  // Minimum comes from the host's config, never from the browser.
  const configured = Number(experience.config?.scenario_minimum_entries);
  const min = Number.isFinite(configured) ? Math.max(2, configured) : 3;

  const [{ count }, { data: entry }] = await Promise.all([
    supabase
      .from('scenario_entries')
      .select('*', { count: 'exact', head: true })
      .eq('experience_id', experienceId)
      .eq('prompt_id', promptId),
    supabase.from('scenario_entries').select('experience_id,prompt_id').eq('id', entryId).maybeSingle(),
  ]);

  if (!entry || entry.experience_id !== experienceId || entry.prompt_id !== promptId) {
    return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
  }
  if ((count ?? 0) < min) {
    return NextResponse.json({ error: 'Voting has not opened yet.' }, { status: 400 });
  }

  const { error } = await supabase.from('scenario_votes').insert({
    experience_id: experienceId,
    prompt_id: promptId,
    entry_id: entryId,
    device_token: String(deviceToken).slice(0, 100),
  });

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'You already used your vote for this scenario.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

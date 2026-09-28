import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const { competitionId, entryId, deviceToken } = body ?? {};

  if (!competitionId || !entryId || !deviceToken) {
    return NextResponse.json({ error: 'Invalid vote.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: competition, error: compError } = await supabase
    .from('competitions')
    .select('minimum_entries,voting_enabled,max_votes_per_device')
    .eq('id', competitionId)
    .single();

  if (compError || !competition || !competition.voting_enabled) {
    return NextResponse.json({ error: 'Voting is not available.' }, { status: 400 });
  }

  const { count } = await supabase
    .from('competition_entries')
    .select('*', { count: 'exact', head: true })
    .eq('competition_id', competitionId);

  if ((count ?? 0) < competition.minimum_entries) {
    return NextResponse.json({ error: 'Voting has not opened yet.' }, { status: 400 });
  }

  const token = String(deviceToken).slice(0, 100);
  const { count: priorVotes } = await supabase
    .from('competition_votes')
    .select('*', { count: 'exact', head: true })
    .eq('competition_id', competitionId)
    .eq('device_token', token);

  if ((priorVotes ?? 0) >= competition.max_votes_per_device) {
    return NextResponse.json({ error: 'You have already used your vote for this competition.' }, { status: 409 });
  }

  const { error } = await supabase.from('competition_votes').insert({
    competition_id: competitionId,
    entry_id: entryId,
    device_token: token,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id,slug,name,subtitle,intro,theme')
    .eq('slug', slug)
    .eq('active', true)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const { data: experiences, error: expError } = await supabase
    .from('experiences')
    .select('*')
    .eq('event_id', event.id)
    .order('sort_order');

  if (expError) return NextResponse.json({ error: expError.message }, { status: 500 });

  const ids = (experiences ?? []).map((e) => e.id);

  const [promptsRes, triviaRes, compsRes, scoresRes] = await Promise.all([
    ids.length ? supabase.from('prompts').select('*').in('experience_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from('trivia_questions').select('*').in('experience_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from('competitions').select('*').in('experience_id', ids) : Promise.resolve({ data: [], error: null }),
    supabase.from('trivia_scores').select('display_name,score,completed_at').eq('event_id', event.id).order('score', { ascending: false }).order('completed_at', { ascending: true }).limit(20),
  ]);

  const competitionIds = (compsRes.data ?? []).map((c) => c.id);
  const entriesRes = competitionIds.length
    ? await supabase.from('competition_entry_results').select('*').in('competition_id', competitionIds).order('votes', { ascending: false }).order('created_at', { ascending: true })
    : { data: [], error: null };

  const prompts: Record<string, unknown[]> = {};
  const trivia: Record<string, unknown[]> = {};
  const competitions: Record<string, unknown | null> = {};
  const competitionEntries: Record<string, unknown[]> = {};

  for (const exp of experiences ?? []) {
    prompts[exp.id] = (promptsRes.data ?? []).filter((p) => p.experience_id === exp.id);
    trivia[exp.id] = (triviaRes.data ?? []).filter((q) => q.experience_id === exp.id);
    const comp = (compsRes.data ?? []).find((c) => c.experience_id === exp.id) ?? null;
    competitions[exp.id] = comp;
    competitionEntries[exp.id] = comp
      ? (entriesRes.data ?? []).filter((entry) => entry.competition_id === comp.id)
      : [];
  }

  return NextResponse.json({
    event,
    experiences: experiences ?? [],
    prompts,
    trivia,
    competitions,
    competitionEntries,
    leaderboard: scoresRes.data ?? [],
  });
}

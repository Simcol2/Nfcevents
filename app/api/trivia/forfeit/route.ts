import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { cleanSecret } from '@/lib/trivia';

export const dynamic = 'force-dynamic';

// Called with navigator.sendBeacon when a guest leaves the screen mid-question.
export async function POST(request: Request) {
  let body: { attemptId?: unknown; playerSecret?: unknown } | null = null;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const secret = cleanSecret(body?.playerSecret);
  if (typeof body?.attemptId !== 'string' || !secret) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: attempt } = await supabase
    .from('trivia_attempts')
    .select('id,player:trivia_players(player_secret)')
    .eq('id', body.attemptId)
    .maybeSingle();

  const player = attempt?.player as unknown as { player_secret: string } | null;
  if (!attempt || player?.player_secret !== secret) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await supabase.from('trivia_attempts').update({ status: 'forfeited' }).eq('id', attempt.id).eq('status', 'open');
  return NextResponse.json({ ok: true });
}

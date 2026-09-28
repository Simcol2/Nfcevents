import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { buildState, cleanSecret, findPlayer, forfeitOpenAttempts, loadTriviaExperience } from '@/lib/trivia';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { experienceId, playerSecret, onLoad } = body ?? {};
  if (typeof experienceId !== 'string') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const experience = await loadTriviaExperience(supabase, experienceId);
  if (!experience) return NextResponse.json({ error: 'Trivia not found.' }, { status: 404 });

  const secret = cleanSecret(playerSecret);
  const player = secret ? await findPlayer(supabase, experienceId, secret) : null;

  // Opening the trivia screen fresh (reload, coming back from another app)
  // means any question left open is gone for good.
  if (player && onLoad === true) await forfeitOpenAttempts(supabase, player.id);

  return NextResponse.json(await buildState(supabase, experience.id, experience.config, player));
}

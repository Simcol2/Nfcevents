import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { cleanSecret, getWindow, loadTriviaExperience } from '@/lib/trivia';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { attemptId, playerSecret, choice } = body ?? {};
  const secret = cleanSecret(playerSecret);
  if (typeof attemptId !== 'string' || !secret || !Number.isInteger(choice)) {
    return NextResponse.json({ error: 'Invalid answer.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: attempt } = await supabase
    .from('trivia_attempts')
    .select('id,experience_id,status,question:trivia_questions(points,correct_index,answers),player:trivia_players(player_secret)')
    .eq('id', attemptId)
    .maybeSingle();

  const question = attempt?.question as unknown as { points: number; correct_index: number; answers: string[] } | null;
  const player = attempt?.player as unknown as { player_secret: string } | null;
  if (!attempt || !question || player?.player_secret !== secret) {
    return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  }
  if (attempt.status !== 'open') {
    return NextResponse.json({ error: 'That question is gone. Leaving the screen forfeits it.' }, { status: 409 });
  }
  if (choice < 0 || choice >= question.answers.length) {
    return NextResponse.json({ error: 'Invalid answer.' }, { status: 400 });
  }

  const experience = await loadTriviaExperience(supabase, attempt.experience_id);
  if (!experience) return NextResponse.json({ error: 'Trivia not found.' }, { status: 404 });
  const window = await getWindow(supabase, experience.id, experience.config);
  if (window.status === 'closed') {
    await supabase.from('trivia_attempts').update({ status: 'forfeited' }).eq('id', attempt.id).eq('status', 'open');
    return NextResponse.json({ error: 'Time is up. Trivia has closed.' }, { status: 409 });
  }

  const correct = choice === question.correct_index;
  const pointsAwarded = correct ? question.points : 0;

  // Only succeeds if the question is still open (not forfeited in the meantime).
  const { data: updated } = await supabase
    .from('trivia_attempts')
    .update({
      status: 'answered',
      chosen_index: choice,
      is_correct: correct,
      points_awarded: pointsAwarded,
      answered_at: new Date().toISOString(),
    })
    .eq('id', attempt.id)
    .eq('status', 'open')
    .select('id');

  if (!updated?.length) {
    return NextResponse.json({ error: 'That question is gone. Leaving the screen forfeits it.' }, { status: 409 });
  }

  // The correct answer is not revealed, so it cannot be passed around the table.
  return NextResponse.json({ correct, pointsAwarded });
}

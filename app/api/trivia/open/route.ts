import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { cleanName, cleanSecret, findPlayer, forfeitOpenAttempts, getWindow, loadTriviaExperience } from '@/lib/trivia';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { experienceId, playerSecret, displayName, category, points } = body ?? {};

  const secret = cleanSecret(playerSecret);
  const name = cleanName(displayName);
  if (typeof experienceId !== 'string' || !secret || typeof category !== 'string' || !Number.isInteger(points)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const experience = await loadTriviaExperience(supabase, experienceId);
  if (!experience) return NextResponse.json({ error: 'Trivia not found.' }, { status: 404 });

  const cat = experience.config.categories.find((c) => c.key === category);
  if (!cat || !experience.config.pointValues.includes(points)) {
    return NextResponse.json({ error: 'That tile does not exist.' }, { status: 400 });
  }

  const window = await getWindow(supabase, experience.id, experience.config);
  if (window.status === 'closed') return NextResponse.json({ error: 'Trivia has closed. Check the final results.' }, { status: 409 });

  let player = await findPlayer(supabase, experience.id, secret);
  if (!player) {
    if (!name) return NextResponse.json({ error: 'Please enter your name first.' }, { status: 400 });
    const { data, error } = await supabase
      .from('trivia_players')
      .upsert({ experience_id: experience.id, player_secret: secret, display_name: name }, { onConflict: 'experience_id,player_secret' })
      .select('id,display_name')
      .single();
    if (error || !data) return NextResponse.json({ error: 'Could not register player.' }, { status: 500 });
    player = data;
  }

  // Only one question can be open at a time.
  await forfeitOpenAttempts(supabase, player.id);

  const [questionsRes, seenRes] = await Promise.all([
    supabase
      .from('trivia_questions')
      .select('id,question,answers')
      .eq('experience_id', experience.id)
      .eq('category', cat.key)
      .eq('points', points)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    supabase.from('trivia_attempts').select('question_id').eq('player_id', player.id),
  ]);

  const seen = new Set((seenRes.data ?? []).map((r) => r.question_id as string));
  // Same order for everyone, so every guest meets the same questions.
  const next = (questionsRes.data ?? []).find((q) => !seen.has(q.id));
  if (!next) return NextResponse.json({ error: 'You have played every question in that tile. Pick another.' }, { status: 409 });

  const { data: attempt, error: attemptError } = await supabase
    .from('trivia_attempts')
    .insert({ experience_id: experience.id, player_id: player.id, question_id: next.id })
    .select('id')
    .single();
  if (attemptError || !attempt) return NextResponse.json({ error: 'Could not open that question. Try again.' }, { status: 409 });

  return NextResponse.json({
    attemptId: attempt.id,
    category: cat.key,
    categoryLabel: cat.label,
    points,
    question: next.question,
    answers: next.answers,
  });
}

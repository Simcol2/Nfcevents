import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const { eventId, experienceId, displayName, deviceToken, score } = body ?? {};

  if (!eventId || !experienceId || !displayName || !deviceToken || !Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: 'Invalid score submission.' }, { status: 400 });
  }

  const safeName = String(displayName).trim().slice(0, 32);
  if (!safeName) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('trivia_scores').insert({
    event_id: eventId,
    experience_id: experienceId,
    display_name: safeName,
    device_token: String(deviceToken).slice(0, 100),
    score,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

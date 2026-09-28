import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Server/admin retrieval hook for post-event delivery.
// The current repo has no host account/email field, so this route deliberately
// requires a server secret. Your booking/admin system can call it after the event
// and email/display the wrap-up to the renter.
export async function POST(request: Request) {
  const key = request.headers.get('x-host-wrap-key');
  if (!process.env.HOST_WRAP_KEY || key !== process.env.HOST_WRAP_KEY) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { eventId, experienceId } = body ?? {};
  if (!eventId || !experienceId) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase.from('trouble_sessions')
    .select('status,wrapped_at,host_wrap_text')
    .eq('event_id', eventId)
    .eq('experience_id', experienceId)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Trouble session not found.' }, { status: 404 });
  if (session.status !== 'wrapped' || !session.host_wrap_text) {
    return NextResponse.json({ ready: false, status: session.status });
  }
  return NextResponse.json({ ready: true, wrappedAt: session.wrapped_at, text: session.host_wrap_text });
}

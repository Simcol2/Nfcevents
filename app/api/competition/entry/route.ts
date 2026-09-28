import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const { competitionId, displayName, textEntry, mediaUrl } = body ?? {};

  if (!competitionId || (!String(textEntry ?? '').trim() && !mediaUrl)) {
    return NextResponse.json({ error: 'Entry is empty.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('competition_entries').insert({
    competition_id: competitionId,
    display_name: String(displayName ?? '').trim().slice(0, 32) || null,
    text_entry: String(textEntry ?? '').trim().slice(0, 1000) || null,
    media_url: mediaUrl || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

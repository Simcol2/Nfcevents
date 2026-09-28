import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { hashDeviceToken } from '@/lib/trouble';

export const dynamic = 'force-dynamic';

// Which experience (if any) this device is locked into, so a refresh reopens it.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { eventId, deviceToken } = body ?? {};
  const tokenHash = hashDeviceToken(deviceToken);
  if (!eventId || !tokenHash) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { data: participant } = await supabase.from('event_participants')
    .select('id,experience_id,display_name')
    .eq('event_id', eventId).eq('device_token', tokenHash).maybeSingle();
  return NextResponse.json({ participant: participant ?? null });
}

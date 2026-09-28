import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { hashDeviceToken, isCrewExperience, parseRoles } from '@/lib/trouble';

const PARTICIPANT_COLUMNS = 'id,event_id,experience_id,display_name,locked_at';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { eventId, experienceId, deviceToken, displayName } = body ?? {};
  const tokenHash = hashDeviceToken(deviceToken);
  if (!eventId || !experienceId || !tokenHash || !String(displayName ?? '').trim()) {
    return NextResponse.json({ error: 'Name and experience are required.' }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: experience } = await supabase.from('experiences').select('id,event_id,title,config').eq('id', experienceId).maybeSingle();
  if (!experience || experience.event_id !== eventId) return NextResponse.json({ error: 'Experience not found.' }, { status: 404 });

  const { data: existing, error: existingError } = await supabase.from('event_participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('event_id', eventId).eq('device_token', tokenHash).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) {
    if (existing.experience_id !== experienceId) {
      return NextResponse.json({ error: "You're already locked into another experience for tonight.", participant: existing }, { status: 409 });
    }
    return NextResponse.json({ participant: existing, alreadyLocked: true });
  }

  // A crew game can only take people while its lobby is open and it has a role for them.
  if (isCrewExperience(experience.config)) {
    const roles = parseRoles(experience.config ?? {});
    const [{ data: session }, { count }] = await Promise.all([
      supabase.from('trouble_sessions').select('status').eq('event_id', eventId).eq('experience_id', experienceId).maybeSingle(),
      supabase.from('event_participants').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('experience_id', experienceId),
    ]);
    if (session && session.status !== 'lobby') {
      return NextResponse.json({ error: `The crew for ${experience.title} has already locked in. Please choose another experience.` }, { status: 409 });
    }
    if ((count ?? 0) >= roles.length) {
      return NextResponse.json({ error: `The crew for ${experience.title} is full (${roles.length} roles). Please choose another experience.` }, { status: 409 });
    }
  }

  const { data: participant, error } = await supabase.from('event_participants').insert({
    event_id: eventId,
    experience_id: experienceId,
    device_token: tokenHash,
    display_name: String(displayName).trim().slice(0, 60),
  }).select(PARTICIPANT_COLUMNS).single();
  if (error?.code === '23505') {
    return NextResponse.json({ error: "You're already locked into an experience for tonight." }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ participant, alreadyLocked: false });
}

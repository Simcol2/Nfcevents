import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { hashDeviceToken } from '@/lib/trouble';
import { parseDareRoles } from '@/lib/trouble-dares';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { eventId, experienceId, deviceToken } = body ?? {};
  const tokenHash = hashDeviceToken(deviceToken);
  if (!eventId || !experienceId || !tokenHash) {
    return NextResponse.json({ error: 'Invalid state request.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: participant }, { data: experience }] = await Promise.all([
    supabase.from('event_participants')
      .select('id,display_name,experience_id')
      .eq('event_id', eventId)
      .eq('device_token', tokenHash)
      .maybeSingle(),
    supabase.from('experiences')
      .select('id,event_id,config')
      .eq('id', experienceId)
      .maybeSingle(),
  ]);

  if (!participant || participant.experience_id !== experienceId) {
    return NextResponse.json({ error: 'You are not locked into A Little Trouble.' }, { status: 403 });
  }
  if (!experience || experience.event_id !== eventId) {
    return NextResponse.json({ error: 'Experience not found.' }, { status: 404 });
  }

  let { data: session } = await supabase.from('trouble_sessions')
    .select('*')
    .eq('event_id', eventId)
    .eq('experience_id', experienceId)
    .maybeSingle();

  if (!session) {
    const made = await supabase.from('trouble_sessions')
      .insert({ event_id: eventId, experience_id: experienceId, prompt_id: null, status: 'lobby' })
      .select('*')
      .single();
    if (made.error) return NextResponse.json({ error: made.error.message }, { status: 500 });
    session = made.data;
  }

  const roles = parseDareRoles(experience.config ?? {});

  const liveMembersQuery = supabase.from('event_participants')
    .select('id,display_name,locked_at')
    .eq('event_id', eventId)
    .eq('experience_id', experienceId)
    .order('locked_at');

  const frozenMembersQuery = supabase.from('trouble_session_members')
    .select('participant:event_participants(id,display_name,locked_at)')
    .eq('session_id', session.id);

  const memberResult = session.status === 'lobby' ? await liveMembersQuery : await frozenMembersQuery;
  const members = session.status === 'lobby'
    ? (memberResult.data ?? [])
    : (memberResult.data ?? []).map((row: any) => row.participant).filter(Boolean);

  const [roleVotesRes, assignmentsRes, tasksRes, collabsRes] = await Promise.all([
    supabase.from('trouble_role_votes')
      .select('voter_participant_id,role_key,nominee_participant_id,round')
      .eq('session_id', session.id)
      .eq('round', session.vote_round),
    supabase.from('trouble_role_assignments')
      .select('role_key,participant_id')
      .eq('session_id', session.id),
    supabase.from('trouble_player_tasks')
      .select('participant_id,role_key,status,truth_answer,result_note,dare:trouble_dares(id,title,dare_text,success_text),truth:trouble_truths(id,prompt)')
      .eq('session_id', session.id),
    supabase.from('trouble_collabs')
      .select('id,requester_id,helper_id,status,created_at,responded_at')
      .eq('session_id', session.id)
      .in('status', ['pending', 'accepted']),
  ]);

  const roleVotes = roleVotesRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const collabs = collabsRes.data ?? [];

  const myAssignment = assignments.find((a: any) => a.participant_id === participant.id) ?? null;
  const myRole = myAssignment ? roles.find((r) => r.key === myAssignment.role_key) ?? null : null;
  const myTaskRaw = tasks.find((t: any) => t.participant_id === participant.id) ?? null;
  const myTask = myTaskRaw ? {
    participant_id: myTaskRaw.participant_id,
    role_key: myTaskRaw.role_key,
    status: myTaskRaw.status,
    truth_answer: myTaskRaw.truth_answer,
    result_note: myTaskRaw.result_note,
    dare: myTaskRaw.dare,
    truth: myTaskRaw.truth,
  } : null;

  const memberName = new Map(members.map((m: any) => [m.id, m.display_name]));

  const myPendingIncoming = collabs.find((c: any) => c.helper_id === participant.id && c.status === 'pending') ?? null;
  const myPendingOutgoing = collabs.find((c: any) => c.requester_id === participant.id && c.status === 'pending') ?? null;
  const myAccepted = collabs.find((c: any) => c.status === 'accepted' && (c.requester_id === participant.id || c.helper_id === participant.id)) ?? null;

  let incoming = null;
  if (myPendingIncoming) {
    const requesterTask: any = tasks.find((t: any) => t.participant_id === myPendingIncoming.requester_id);
    incoming = {
      ...myPendingIncoming,
      requester_name: memberName.get(myPendingIncoming.requester_id) ?? 'Crew member',
      requester_dare: requesterTask?.dare ?? null,
    };
  }

  let alliance = null;
  if (myAccepted) {
    const partnerId = myAccepted.requester_id === participant.id ? myAccepted.helper_id : myAccepted.requester_id;
    const partnerTask: any = tasks.find((t: any) => t.participant_id === partnerId);
    alliance = {
      ...myAccepted,
      partner_id: partnerId,
      partner_name: memberName.get(partnerId) ?? 'Crew member',
      partner_task: partnerTask ? {
        status: partnerTask.status,
        dare: partnerTask.dare,
        truth: partnerTask.truth,
        truth_answer: partnerTask.truth_answer,
      } : null,
    };
  }

  const publicTruths = tasks
    .filter((t: any) => t.status === 'truth' && t.truth_answer)
    .map((t: any) => ({
      participant_id: t.participant_id,
      name: memberName.get(t.participant_id) ?? 'Crew member',
      prompt: t.truth?.prompt ?? '',
      answer: t.truth_answer,
    }));

  const progress = {
    total: members.length,
    resolved: tasks.filter((t: any) => t.status !== 'assigned').length,
    completed: tasks.filter((t: any) => t.status === 'completed').length,
    caught: tasks.filter((t: any) => t.status === 'caught').length,
    truths: tasks.filter((t: any) => t.status === 'truth').length,
    alliances: collabs.filter((c: any) => c.status === 'accepted').length,
  };

  const counts: Record<string, Record<string, number>> = {};
  for (const role of roles) counts[role.key] = {};
  for (const vote of roleVotes) {
    counts[vote.role_key] ??= {};
    counts[vote.role_key][vote.nominee_participant_id] = (counts[vote.role_key][vote.nominee_participant_id] ?? 0) + 1;
  }

  return NextResponse.json({
    participant,
    session,
    roles: roles.slice(0, members.length),
    members,
    // Individual vote records are never sent to the browser — only the
    // requester's own votes and the aggregated counts below. This is what
    // makes "nobody sees who voted for whom" actually true.
    myVotes: roleVotes.filter((v: any) => v.voter_participant_id === participant.id),
    roleVoteCounts: counts,
    assignments,
    myAssignment,
    myRole,
    myTask,
    incomingCollab: incoming,
    outgoingCollab: myPendingOutgoing,
    alliance,
    publicTruths,
    progress,
    minCrew: Math.max(2, Number((experience.config as any)?.trouble_min_crew ?? 2)),
  });
}

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { hashDeviceToken } from '@/lib/trouble';
import { assignRandomDares, assignRoles, makeHostWrap, parseDareRoles } from '@/lib/trouble-dares';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { action, eventId, experienceId, deviceToken } = body ?? {};
  const tokenHash = hashDeviceToken(deviceToken);
  if (!action || !eventId || !experienceId || !tokenHash) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: participant }, { data: experience }, { data: session }] = await Promise.all([
    supabase.from('event_participants')
      .select('id,display_name,experience_id')
      .eq('event_id', eventId)
      .eq('device_token', tokenHash)
      .maybeSingle(),
    supabase.from('experiences')
      .select('id,event_id,config')
      .eq('id', experienceId)
      .maybeSingle(),
    supabase.from('trouble_sessions')
      .select('*')
      .eq('event_id', eventId)
      .eq('experience_id', experienceId)
      .maybeSingle(),
  ]);

  if (!participant || participant.experience_id !== experienceId || !experience || experience.event_id !== eventId || !session) {
    return NextResponse.json({ error: 'Trouble session not found.' }, { status: 404 });
  }

  const roles = parseDareRoles(experience.config ?? {});

  const getMembers = async () => {
    if (session.status === 'lobby') {
      const { data } = await supabase.from('event_participants')
        .select('id,display_name,locked_at')
        .eq('event_id', eventId)
        .eq('experience_id', experienceId)
        .order('locked_at');
      return data ?? [];
    }
    const { data } = await supabase.from('trouble_session_members')
      .select('participant:event_participants(id,display_name,locked_at)')
      .eq('session_id', session.id);
    return (data ?? []).map((r: any) => r.participant).filter(Boolean);
  };

  if (action === 'lockCrew') {
    if (session.status !== 'lobby') return NextResponse.json({ ok: true });
    const members = await getMembers();
    const minCrew = Math.max(2, Number((experience.config as any)?.trouble_min_crew ?? 2));
    if (members.length < minCrew) return NextResponse.json({ error: `Need at least ${minCrew} people.` }, { status: 400 });
    if (members.length > roles.length) return NextResponse.json({ error: `This version supports up to ${roles.length} Trouble players.` }, { status: 400 });

    const saved = await supabase.from('trouble_session_members').insert(
      members.map((m: any) => ({ session_id: session.id, participant_id: m.id })),
    );
    if (saved.error && saved.error.code !== '23505') return NextResponse.json({ error: saved.error.message }, { status: 500 });

    const { error } = await supabase.from('trouble_sessions')
      .update({ status: 'voting' })
      .eq('id', session.id)
      .eq('status', 'lobby');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const members = await getMembers();
  const memberIds = new Set(members.map((m: any) => m.id));
  if (!memberIds.has(participant.id)) return NextResponse.json({ error: 'You are not in this Trouble crew.' }, { status: 403 });

  if (action === 'voteRoles') {
    if (session.status !== 'voting') return NextResponse.json({ error: 'Role voting is closed.' }, { status: 409 });
    const activeRoles = roles.slice(0, members.length);
    const allowedRoles = new Set(activeRoles.map((r) => r.key));
    const nominations = Array.isArray(body.nominations) ? body.nominations : [];

    if (nominations.length !== activeRoles.length || new Set(nominations.map((n: any) => n.roleKey)).size !== activeRoles.length) {
      return NextResponse.json({ error: 'Vote once for every role.' }, { status: 400 });
    }
    for (const n of nominations) {
      if (!allowedRoles.has(String(n.roleKey)) || !memberIds.has(String(n.nomineeParticipantId))) {
        return NextResponse.json({ error: 'Invalid role vote.' }, { status: 400 });
      }
    }

    await supabase.from('trouble_role_votes')
      .delete()
      .eq('session_id', session.id)
      .eq('voter_participant_id', participant.id)
      .eq('round', session.vote_round);

    const inserted = await supabase.from('trouble_role_votes').insert(
      nominations.map((n: any) => ({
        session_id: session.id,
        voter_participant_id: participant.id,
        role_key: String(n.roleKey),
        nominee_participant_id: String(n.nomineeParticipantId),
        round: session.vote_round,
      })),
    );
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });

    const { data: allVotes } = await supabase.from('trouble_role_votes')
      .select('voter_participant_id')
      .eq('session_id', session.id)
      .eq('round', session.vote_round);

    const allDone = members.length > 0 && members.every((m: any) =>
      (allVotes ?? []).filter((v: any) => v.voter_participant_id === m.id).length >= activeRoles.length,
    );

    if (allDone) {
      const assignments = await assignRoles(
        supabase,
        session.id,
        members.map((m: any) => m.id),
        activeRoles,
        session.vote_round,
      );
      await supabase.from('trouble_role_assignments').delete().eq('session_id', session.id);
      const savedAssignments = await supabase.from('trouble_role_assignments').insert(
        assignments.map((a) => ({ session_id: session.id, ...a })),
      );
      if (savedAssignments.error) return NextResponse.json({ error: savedAssignments.error.message }, { status: 500 });

      await assignRandomDares(supabase, session.id, assignments);
      await supabase.from('trouble_sessions').update({ status: 'active' }).eq('id', session.id).eq('status', 'voting');
    }

    return NextResponse.json({ ok: true, allDone });
  }

  if (action === 'recruit') {
    if (session.status !== 'active') return NextResponse.json({ error: 'Trouble is not active.' }, { status: 409 });
    const helperId = String(body.helperId ?? '');
    if (!helperId || helperId === participant.id || !memberIds.has(helperId)) {
      return NextResponse.json({ error: 'Choose another member of your Trouble crew.' }, { status: 400 });
    }

    const { data: myTask } = await supabase.from('trouble_player_tasks')
      .select('status')
      .eq('session_id', session.id)
      .eq('participant_id', participant.id)
      .maybeSingle();
    if (!myTask || myTask.status !== 'assigned') return NextResponse.json({ error: 'You can only recruit while your dare is still active.' }, { status: 409 });

    const { data: openCollabs } = await supabase.from('trouble_collabs')
      .select('id,requester_id,helper_id,status')
      .eq('session_id', session.id)
      .in('status', ['pending', 'accepted']);
    const busyIds = new Set((openCollabs ?? []).flatMap((c: any) => [c.requester_id, c.helper_id]));
    if (busyIds.has(participant.id)) return NextResponse.json({ error: 'You already have an active collaboration.' }, { status: 409 });
    if (busyIds.has(helperId)) return NextResponse.json({ error: 'That person is already in another collaboration.' }, { status: 409 });

    const { error } = await supabase.from('trouble_collabs').insert({
      session_id: session.id,
      requester_id: participant.id,
      helper_id: helperId,
      status: 'pending',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'respondCollab') {
    const collabId = String(body.collabId ?? '');
    const accept = body.accept === true;
    const { data: collab } = await supabase.from('trouble_collabs')
      .select('*')
      .eq('id', collabId)
      .eq('session_id', session.id)
      .eq('helper_id', participant.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (!collab) return NextResponse.json({ error: 'Collaboration request not found.' }, { status: 404 });

    if (accept) {
      const { data: openCollabs } = await supabase.from('trouble_collabs')
        .select('id,requester_id,helper_id,status')
        .eq('session_id', session.id)
        .in('status', ['pending', 'accepted']);
      const conflict = (openCollabs ?? []).some((c: any) =>
        c.id !== collab.id && [c.requester_id, c.helper_id].includes(participant.id),
      );
      if (conflict) return NextResponse.json({ error: 'You are already in another collaboration.' }, { status: 409 });
    }

    await supabase.from('trouble_collabs').update({
      status: accept ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    }).eq('id', collab.id).eq('status', 'pending');
    return NextResponse.json({ ok: true });
  }

  if (action === 'passForTruth') {
    if (session.status !== 'active') return NextResponse.json({ error: 'Trouble is not active.' }, { status: 409 });
    const { data: task } = await supabase.from('trouble_player_tasks')
      .select('status')
      .eq('session_id', session.id)
      .eq('participant_id', participant.id)
      .maybeSingle();
    if (!task || task.status !== 'assigned') return NextResponse.json({ error: 'Your dare is already resolved.' }, { status: 409 });

    const { data: truths } = await supabase.from('trouble_truths').select('id').eq('active', true);
    if (!truths?.length) return NextResponse.json({ error: 'No Truth prompts are configured.' }, { status: 500 });
    const truth = truths[Math.floor(Math.random() * truths.length)];
    const { error } = await supabase.from('trouble_player_tasks').update({
      truth_id: truth.id,
      updated_at: new Date().toISOString(),
    }).eq('session_id', session.id).eq('participant_id', participant.id).eq('status', 'assigned');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'submitTruth') {
    const answer = String(body.answer ?? '').trim().slice(0, 600);
    if (!answer) return NextResponse.json({ error: 'Answer the Truth first.' }, { status: 400 });
    const { data: task } = await supabase.from('trouble_player_tasks')
      .select('status,truth_id')
      .eq('session_id', session.id)
      .eq('participant_id', participant.id)
      .maybeSingle();
    if (!task || task.status !== 'assigned' || !task.truth_id) return NextResponse.json({ error: 'You do not have a Truth prompt waiting.' }, { status: 409 });

    await supabase.from('trouble_player_tasks').update({
      status: 'truth',
      truth_answer: answer,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('session_id', session.id).eq('participant_id', participant.id);

    await maybeWrap();
    return NextResponse.json({ ok: true });
  }

  if (action === 'finishDare') {
    const result = body.result === 'caught' ? 'caught' : 'completed';
    const note = String(body.note ?? '').trim().slice(0, 500);
    const { data: task } = await supabase.from('trouble_player_tasks')
      .select('status')
      .eq('session_id', session.id)
      .eq('participant_id', participant.id)
      .maybeSingle();
    if (!task || task.status !== 'assigned') return NextResponse.json({ error: 'Your dare is already resolved.' }, { status: 409 });

    await supabase.from('trouble_player_tasks').update({
      status: result,
      result_note: note || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('session_id', session.id).eq('participant_id', participant.id);

    await maybeWrap();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  async function maybeWrap() {
    const [membersRes, assignmentsRes, tasksRes, collabsRes] = await Promise.all([
      supabase.from('trouble_session_members')
        .select('participant:event_participants(id,display_name)')
        .eq('session_id', session.id),
      supabase.from('trouble_role_assignments')
        .select('participant_id,role_key')
        .eq('session_id', session.id),
      supabase.from('trouble_player_tasks')
        .select('participant_id,status,truth_answer,result_note,dare:trouble_dares(title,dare_text),truth:trouble_truths(prompt)')
        .eq('session_id', session.id),
      supabase.from('trouble_collabs')
        .select('requester_id,helper_id,status')
        .eq('session_id', session.id),
    ]);

    const frozen = (membersRes.data ?? []).map((r: any) => r.participant).filter(Boolean);
    const tasks = tasksRes.data ?? [];
    if (!frozen.length || tasks.length < frozen.length || tasks.some((t: any) => t.status === 'assigned')) return;

    const wrap = makeHostWrap({
      members: frozen,
      roles,
      assignments: assignmentsRes.data ?? [],
      tasks: tasks.map((t: any) => ({
        participant_id: t.participant_id,
        status: t.status,
        title: t.dare?.title ?? null,
        dare_text: t.dare?.dare_text ?? null,
        truth_prompt: t.truth?.prompt ?? null,
        truth_answer: t.truth_answer,
        result_note: t.result_note,
      })),
      collabs: collabsRes.data ?? [],
    });

    await supabase.from('trouble_sessions').update({
      status: 'wrapped',
      wrapped_at: new Date().toISOString(),
      host_wrap_text: wrap,
    }).eq('id', session.id).eq('status', 'active');
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';

export type TroubleRole = {
  key: string;
  label: string;
  bio: string;
};

export function parseDareRoles(config: Record<string, unknown> | null | undefined): TroubleRole[] {
  const raw = Array.isArray(config?.trouble_roles) ? config!.trouble_roles as unknown[] : [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter((r) => typeof r.key === 'string' && typeof r.label === 'string' && typeof r.bio === 'string')
    .map((r) => ({ key: String(r.key), label: String(r.label), bio: String(r.bio) }))
    .slice(0, 8);
}

export async function assignRoles(
  supabase: SupabaseClient,
  sessionId: string,
  participantIds: string[],
  roles: TroubleRole[],
  round: number,
) {
  const activeRoles = roles.slice(0, participantIds.length);
  const { data: votes, error } = await supabase
    .from('trouble_role_votes')
    .select('role_key,nominee_participant_id')
    .eq('session_id', sessionId)
    .eq('round', round);
  if (error) throw error;

  const score = new Map<string, number>();
  for (const vote of votes ?? []) {
    const key = `${vote.role_key}:${vote.nominee_participant_id}`;
    score.set(key, (score.get(key) ?? 0) + 1);
  }

  let bestScore = -1;
  let best: Array<{ role_key: string; participant_id: string }> = [];

  function search(
    i: number,
    remaining: string[],
    current: Array<{ role_key: string; participant_id: string }>,
    total: number,
  ) {
    if (i >= activeRoles.length) {
      if (total > bestScore) {
        bestScore = total;
        best = [...current];
      }
      return;
    }
    const role = activeRoles[i];
    for (let x = 0; x < remaining.length; x += 1) {
      const participantId = remaining[x];
      const rest = [...remaining.slice(0, x), ...remaining.slice(x + 1)];
      search(
        i + 1,
        rest,
        [...current, { role_key: role.key, participant_id: participantId }],
        total + (score.get(`${role.key}:${participantId}`) ?? 0),
      );
    }
  }

  search(0, participantIds, [], 0);
  return best;
}

export async function assignRandomDares(
  supabase: SupabaseClient,
  sessionId: string,
  assignments: Array<{ participant_id: string; role_key: string }>,
) {
  for (const assignment of assignments) {
    const { data: dares, error } = await supabase
      .from('trouble_dares')
      .select('id')
      .eq('role_key', assignment.role_key)
      .eq('active', true);
    if (error) throw error;
    if (!dares?.length) throw new Error(`No active dares for ${assignment.role_key}.`);
    const dare = dares[Math.floor(Math.random() * dares.length)];
    const { error: insertError } = await supabase.from('trouble_player_tasks').upsert({
      session_id: sessionId,
      participant_id: assignment.participant_id,
      role_key: assignment.role_key,
      dare_id: dare.id,
      status: 'assigned',
      truth_id: null,
      truth_answer: null,
      result_note: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,participant_id' });
    if (insertError) throw insertError;
  }
}

export function makeHostWrap(args: {
  members: Array<{ id: string; display_name: string }>;
  roles: TroubleRole[];
  assignments: Array<{ participant_id: string; role_key: string }>;
  tasks: Array<{
    participant_id: string;
    status: 'assigned' | 'completed' | 'caught' | 'truth';
    title: string | null;
    dare_text: string | null;
    truth_prompt: string | null;
    truth_answer: string | null;
    result_note: string | null;
  }>;
  collabs: Array<{ requester_id: string; helper_id: string; status: string }>;
}) {
  const name = new Map(args.members.map((m) => [m.id, m.display_name]));
  const role = new Map(args.roles.map((r) => [r.key, r.label]));
  const assignment = new Map(args.assignments.map((a) => [a.participant_id, a.role_key]));
  const done = args.tasks.filter((t) => t.status !== 'assigned');
  const completed = done.filter((t) => t.status === 'completed').length;
  const caught = done.filter((t) => t.status === 'caught').length;
  const truths = done.filter((t) => t.status === 'truth').length;
  const accepted = args.collabs.filter((c) => c.status === 'accepted');

  const lines = [
    `LAST NIGHT'S TROUBLE`,
    ``,
    `${args.members.length} players. ${completed} dares completed. ${caught} got caught. ${truths} chose Truth. ${accepted.length} alliance${accepted.length === 1 ? '' : 's'} formed.`,
    ``,
  ];

  for (const task of done) {
    const person = name.get(task.participant_id) ?? 'Guest';
    const roleLabel = role.get(assignment.get(task.participant_id) ?? '') ?? 'Troublemaker';
    lines.push(`${person} — ${roleLabel}`);
    if (task.status === 'truth') {
      lines.push(`Chose Truth instead of the dare.`);
      if (task.truth_prompt) lines.push(`Q: ${task.truth_prompt}`);
      if (task.truth_answer) lines.push(`A: ${task.truth_answer}`);
    } else {
      if (task.title) lines.push(`Dare: ${task.title}`);
      lines.push(task.status === 'completed' ? `Result: Pulled it off.` : `Result: Got caught.`);
      if (task.result_note) lines.push(`What happened: ${task.result_note}`);
    }
    const collab = accepted.find((c) => c.requester_id === task.participant_id || c.helper_id === task.participant_id);
    if (collab) {
      const partnerId = collab.requester_id === task.participant_id ? collab.helper_id : collab.requester_id;
      lines.push(`Alliance: ${name.get(partnerId) ?? 'another crew member'}.`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

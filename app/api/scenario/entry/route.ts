import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import type { ScenarioBuilder } from '@/lib/types';

function asText(value: unknown, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function asList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asText(item, 80)).filter(Boolean) : [];
}

/** Keeps only the roles and fields this scenario's builder defines, trimmed. */
function sanitizeAnswers(builder: ScenarioBuilder, raw: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  const rawRoles = raw.roles && typeof raw.roles === 'object' ? (raw.roles as Record<string, unknown>) : {};
  const roles: Record<string, string> = {};
  for (const role of builder.roles ?? []) {
    const person = asText(rawRoles[role.key], 60);
    if (person) roles[role.key] = person;
  }
  clean.roles = roles;

  const missing: string[] = [];
  for (const field of builder.fields ?? []) {
    const value = field.type === 'multiselect'
      ? asList(raw[field.key]).filter((option) => (field.options ?? []).includes(option))
      : field.type === 'select'
        ? ((field.options ?? []).includes(asText(raw[field.key], 120)) ? asText(raw[field.key], 120) : '')
        : asText(raw[field.key], field.type === 'textarea' ? 900 : 180);
    const empty = Array.isArray(value) ? value.length === 0 : !value;
    if (!empty) clean[field.key] = value;
    else if (field.required) missing.push(field.label);
  }
  return { clean, missing };
}

function buildPlanText(groupName: string, answers: Record<string, unknown>) {
  const roles = answers.roles && typeof answers.roles === 'object'
    ? Object.entries(answers.roles as Record<string, unknown>)
        .filter(([, person]) => asText(person))
        .map(([role, person]) => `${role}: ${asText(person, 60)}`)
        .join('; ')
    : '';

  const lines = [
    `Crew: ${groupName}`,
    roles ? `Roles: ${roles}` : '',
    answers.date ? `Date: ${asText(answers.date, 40)}` : '',
    answers.transport ? `Transport: ${asText(answers.transport, 160)}` : '',
    asList(answers.equipment).length ? `Equipment: ${asList(answers.equipment).join(', ')}` : '',
    answers.threats ? `Threat level: ${asText(answers.threats, 120)}` : '',
    answers.hostages ? `Hostage decision: ${asText(answers.hostages, 120)}` : '',
    answers.opening ? `Opening move: ${asText(answers.opening, 500)}` : '',
    answers.inside ? `Inside plan: ${asText(answers.inside, 500)}` : '',
    answers.exit ? `Exit plan: ${asText(answers.exit, 500)}` : '',
    answers.after ? `Afterward: ${asText(answers.after, 500)}` : '',
  ].filter(Boolean);

  return lines.join('\n').slice(0, 4000);
}

function generateSummary(groupName: string, answers: Record<string, unknown>) {
  const style: 'news' | 'police' = Math.random() < 0.5 ? 'news' : 'police';
  const roles = answers.roles && typeof answers.roles === 'object'
    ? Object.entries(answers.roles as Record<string, unknown>)
        .filter(([, person]) => asText(person))
        .map(([role, person]) => `${asText(person, 60)} as ${role.replaceAll('_', ' ')}`)
    : [];
  const transport = asText(answers.transport, 140) || 'an undisclosed mode of transport';
  const date = asText(answers.date, 40) || 'an undisclosed date';
  const equipment = asList(answers.equipment);
  const hostages = asText(answers.hostages, 120) || 'No hostage decision was recorded.';
  const opening = asText(answers.opening, 260) || 'The opening move remains classified.';
  const exit = asText(answers.exit, 260) || 'The crew declined to explain the exit.';
  const after = asText(answers.after, 260) || 'Their post-operation plans remain unknown.';

  if (style === 'news') {
    return {
      style,
      text: `BREAKING: ${groupName} has reportedly pulled off what witnesses are calling an absurdly confident fictional heist on ${date}. The crew included ${roles.length ? roles.join(', ') : 'a suspiciously versatile table of guests'}. They arrived using ${transport}${equipment.length ? `, carrying ${equipment.join(', ')}` : ''}. Their opening move was described as: “${opening}” The group’s bystander policy was: “${hostages}” By the time anyone understood what was happening, the crew was already gone. Their escape plan: “${exit}” Authorities have not confirmed the crew’s whereabouts, largely because the group insists their final move was: “${after}” No real crime occurred, but the table is currently behaving as though it belongs in a very expensive heist movie.`,
    };
  }

  return {
    style,
    text: `INCIDENT REPORT — FICTIONAL SCENARIO. Group name: ${groupName}. Planned date: ${date}. Known participants: ${roles.length ? roles.join('; ') : 'roles not fully assigned'}. Transport listed as ${transport}. Equipment declared: ${equipment.length ? equipment.join(', ') : 'none recorded'}. Opening phase: “${opening}” Bystander/hostage decision: “${hostages}” Exit phase: “${exit}” Post-operation plan: “${after}” Assessment: the group appears unusually pleased with itself and believes the operation would have succeeded. No real-world action is alleged; this report exists solely because dinner needed better conversation.`,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { eventId, experienceId, promptId, groupName, plan, answers } = body ?? {};

  if (!eventId || !experienceId || !promptId) {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: experience }, { data: prompt }] = await Promise.all([
    supabase.from('experiences').select('event_id,mode,config').eq('id', experienceId).maybeSingle(),
    supabase.from('prompts').select('experience_id,builder').eq('id', promptId).maybeSingle(),
  ]);

  if (!experience || !prompt || experience.mode !== 'scenario' || experience.event_id !== eventId || prompt.experience_id !== experienceId) {
    return NextResponse.json({ error: 'Scenario not found.' }, { status: 404 });
  }

  const builder = prompt.builder && typeof prompt.builder === 'object' ? (prompt.builder as ScenarioBuilder) : null;
  const outcome = experience.config?.scenario_outcome;
  const name = asText(groupName, 40);

  let finalPlan: string;
  let structured: Record<string, unknown> | null = null;
  let summary: { style: 'news' | 'police'; text: string } | null = null;

  if (builder) {
    // Guided builder: table/crew name is required, answers are validated and a report is generated.
    if (!name) return NextResponse.json({ error: 'Add your table number or crew name first.' }, { status: 400 });
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json({ error: 'Your plan is empty.' }, { status: 400 });
    }
    const { clean, missing } = sanitizeAnswers(builder, answers as Record<string, unknown>);
    if (missing.length) return NextResponse.json({ error: `Still missing: ${missing.join(', ')}` }, { status: 400 });
    structured = clean;
    finalPlan = buildPlanText(name, clean);
    summary = generateSummary(name, clean);
  } else {
    // Free-text scenarios keep the host's conversation / share / vote setting.
    if (outcome !== 'share' && outcome !== 'vote') {
      return NextResponse.json({ error: 'This scenario is for conversation only.' }, { status: 400 });
    }
    finalPlan = asText(plan, 1600);
    if (!finalPlan) return NextResponse.json({ error: 'Your plan is empty.' }, { status: 400 });
  }

  const { error } = await supabase.from('scenario_entries').insert({
    event_id: eventId,
    experience_id: experienceId,
    prompt_id: promptId,
    group_name: name || null,
    plan: finalPlan,
    answers: structured ?? {},
    summary_style: summary?.style ?? null,
    summary_text: summary?.text ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, summary });
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TriviaCategory, TriviaConfig, TriviaState, TriviaWindow } from '@/lib/types';

const DEFAULT_CATEGORIES: TriviaCategory[] = [];
const DEFAULT_POINT_VALUES = [1, 2, 5];
const DEFAULT_DURATION_MINUTES = 120;

export function readConfig(raw: Record<string, unknown> | null | undefined): TriviaConfig {
  const c = raw ?? {};
  const categories = Array.isArray(c.categories)
    ? (c.categories as TriviaCategory[]).filter((x) => x && typeof x.key === 'string' && typeof x.label === 'string')
    : DEFAULT_CATEGORIES;
  const pointValues = Array.isArray(c.point_values)
    ? (c.point_values as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) > 0)
    : DEFAULT_POINT_VALUES;
  const duration = Number.isFinite(c.duration_minutes) ? Number(c.duration_minutes) : DEFAULT_DURATION_MINUTES;
  const hardEnd = typeof c.hard_end_at === 'string' && !Number.isNaN(Date.parse(c.hard_end_at)) ? c.hard_end_at : null;
  return { categories, pointValues, durationMinutes: duration, hardEndAt: hardEnd };
}

export async function loadTriviaExperience(supabase: SupabaseClient, experienceId: string) {
  const { data, error } = await supabase
    .from('experiences')
    .select('id,mode,config')
    .eq('id', experienceId)
    .single();
  if (error || !data || data.mode !== 'trivia') return null;
  return { id: data.id as string, config: readConfig(data.config) };
}

/**
 * The countdown starts when anyone answers the first question and lasts
 * durationMinutes. An optional hardEndAt closes trivia no matter what.
 */
export async function getWindow(supabase: SupabaseClient, experienceId: string, config: TriviaConfig, now = Date.now()): Promise<TriviaWindow> {
  const { data } = await supabase
    .from('trivia_attempts')
    .select('answered_at')
    .eq('experience_id', experienceId)
    .eq('status', 'answered')
    .order('answered_at', { ascending: true })
    .limit(1);

  const startedAt = data?.[0]?.answered_at ?? null;
  const hardEnd = config.hardEndAt ? Date.parse(config.hardEndAt) : null;

  let closesAt: number | null = startedAt ? Date.parse(startedAt) + config.durationMinutes * 60_000 : null;
  if (hardEnd !== null) closesAt = closesAt === null ? hardEnd : Math.min(closesAt, hardEnd);

  const status: TriviaWindow['status'] = closesAt !== null && now >= closesAt
    ? 'closed'
    : startedAt
      ? 'live'
      : 'waiting';

  return {
    status,
    startedAt,
    closesAt: closesAt === null ? null : new Date(closesAt).toISOString(),
    durationMinutes: config.durationMinutes,
  };
}

export async function findPlayer(supabase: SupabaseClient, experienceId: string, secret: string) {
  const { data } = await supabase
    .from('trivia_players')
    .select('id,display_name')
    .eq('experience_id', experienceId)
    .eq('player_secret', secret)
    .maybeSingle();
  return data as { id: string; display_name: string } | null;
}

export async function forfeitOpenAttempts(supabase: SupabaseClient, playerId: string) {
  await supabase
    .from('trivia_attempts')
    .update({ status: 'forfeited' })
    .eq('player_id', playerId)
    .eq('status', 'open');
}

export function cleanSecret(value: unknown) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length >= 16 && s.length <= 100 ? s : null;
}

export function cleanName(value: unknown) {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 32) : '';
  return s || null;
}

type AttemptRow = {
  player_id: string;
  question_id: string;
  status: string;
  points_awarded: number;
  answered_at: string | null;
};

/** Builds the board, the guest's own score, and the overall + category leaderboards. */
export async function buildState(
  supabase: SupabaseClient,
  experienceId: string,
  config: TriviaConfig,
  player: { id: string; display_name: string } | null,
): Promise<TriviaState> {
  const now = Date.now();
  const [window, questionsRes, attemptsRes, playersRes] = await Promise.all([
    getWindow(supabase, experienceId, config, now),
    supabase.from('trivia_questions').select('id,category,points').eq('experience_id', experienceId),
    supabase.from('trivia_attempts').select('player_id,question_id,status,points_awarded,answered_at').eq('experience_id', experienceId),
    supabase.from('trivia_players').select('id,display_name').eq('experience_id', experienceId),
  ]);

  const questions = (questionsRes.data ?? []) as Array<{ id: string; category: string; points: number }>;
  const attempts = (attemptsRes.data ?? []) as AttemptRow[];
  const names = new Map((playersRes.data ?? []).map((p) => [p.id as string, p.display_name as string]));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  // Board: how many unseen questions this guest has left in each tile.
  const seen = new Set(player ? attempts.filter((a) => a.player_id === player.id).map((a) => a.question_id) : []);
  const board = config.categories.map((cat) => ({
    key: cat.key,
    label: cat.label,
    tiles: config.pointValues.map((points) => ({
      points,
      remaining: questions.filter((q) => q.category === cat.key && q.points === points && !seen.has(q.id)).length,
    })),
  }));

  // Totals. Ties go to whoever reached their score first.
  type Tally = { points: number; reachedAt: string; answered: number };
  const overall = new Map<string, Tally>();
  const byCategory = new Map<string, Map<string, Tally>>();

  for (const a of attempts) {
    if (a.status !== 'answered' || !a.answered_at) continue;
    const q = questionById.get(a.question_id);
    if (!q) continue;

    // reachedAt = time of the guest's latest scoring answer.
    const o = overall.get(a.player_id) ?? { points: 0, reachedAt: '', answered: 0 };
    o.answered += 1;
    if (a.points_awarded > 0) {
      o.points += a.points_awarded;
      if (a.answered_at > o.reachedAt) o.reachedAt = a.answered_at;
    }
    overall.set(a.player_id, o);

    if (a.points_awarded > 0) {
      const catMap = byCategory.get(q.category) ?? new Map<string, Tally>();
      const c = catMap.get(a.player_id) ?? { points: 0, reachedAt: '', answered: 0 };
      c.points += a.points_awarded;
      c.answered += 1;
      if (a.answered_at > c.reachedAt) c.reachedAt = a.answered_at;
      catMap.set(a.player_id, c);
      byCategory.set(q.category, catMap);
    }
  }

  const rank = (m: Map<string, Tally>) =>
    [...m.entries()]
      .sort(([, x], [, y]) => y.points - x.points || x.reachedAt.localeCompare(y.reachedAt))
      .map(([id, t]) => ({ name: names.get(id) ?? 'Guest', points: t.points, answered: t.answered, isYou: player?.id === id }));

  const overallRanked = rank(overall);
  const me = player ? overall.get(player.id) : undefined;

  return {
    now: new Date(now).toISOString(),
    window,
    player: player ? { name: player.display_name, points: me?.points ?? 0, answered: me?.answered ?? 0 } : null,
    board,
    leaderboard: {
      overall: overallRanked.slice(0, 10),
      categories: config.categories.map((cat) => {
        const ranked = rank(byCategory.get(cat.key) ?? new Map());
        return { key: cat.key, label: cat.label, leader: ranked[0] ?? null };
      }),
    },
  };
}

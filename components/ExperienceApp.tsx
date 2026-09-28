'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import type {
  Competition,
  CompetitionEntry,
  EventPayload,
  Experience,
  OpenedQuestion,
  Prompt,
  ScenarioEntry,
  TriviaState,
} from '@/lib/types';

function getDeviceToken() {
  const key = 'interactive-event-device-token';
  let token = window.localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(key, token);
  }
  return token;
}

export default function ExperienceApp({ slug }: { slug: string }) {
  const [data, setData] = useState<EventPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Experience | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load event.');
      setData(json);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load event.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`event-${data.event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_entries' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_votes' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scenario_entries', filter: `event_id=eq.${data.event.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scenario_votes' }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data?.event.id, load]);

  useEffect(() => {
    if (!data) return;
    const t = data.event.theme;
    const root = document.documentElement;
    root.style.setProperty('--cream', t.cream || '#FFF8EE');
    root.style.setProperty('--paper', t.paper || '#FFFDF8');
    root.style.setProperty('--ink', t.ink || '#2E382F');
    root.style.setProperty('--muted', t.muted || '#7A6D5E');
    root.style.setProperty('--accent', t.accent || '#A84421');
    root.style.setProperty('--accent2', t.accent2 || '#8B2933');
  }, [data]);

  if (loading) return <div className="loading">Loading experience…</div>;
  if (error || !data) return <main className="eventApp"><div className="error">{error || 'Event not found.'}</div></main>;

  return (
    <main className="eventApp">
      <header className="eventHeader">
        <p className="eyebrow">The</p>
        <h1 className="eventName">{data.event.name}</h1>
        {data.event.subtitle && <p className="eventSubtitle">{data.event.subtitle}</p>}
        <hr className="rule" />
      </header>

      {!active ? (
        <HomeScreen data={data} onPick={setActive} />
      ) : (
        <ExperienceScreen
          data={data}
          experience={active}
          refresh={load}
          onBack={() => setActive(null)}
        />
      )}
    </main>
  );
}

function HomeScreen({ data, onPick }: { data: EventPayload; onPick: (exp: Experience) => void }) {
  return (
    <section>
      <h2 className="screenTitle">Choose Your Experience</h2>
      <p className="screenCopy">{data.event.intro ?? 'What are you in need of today?'}</p>
      <div className="grid">
        {data.experiences.map((exp) => (
          <button className="expCard" key={exp.id} onClick={() => onPick(exp)}>
            <div>
              <strong>{exp.title}</strong>
              <span>{exp.description}</span>
            </div>
            <div className="arrow">›</div>
          </button>
        ))}
      </div>
      <p className="tiny">Tap whichever one suits you. You can always come back for another.</p>
    </section>
  );
}

function ExperienceScreen({
  data,
  experience,
  refresh,
  onBack,
}: {
  data: EventPayload;
  experience: Experience;
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  if (experience.mode === 'trivia') {
    return (
      <TriviaExperience experience={experience} onBack={onBack} />
    );
  }

  if (experience.mode === 'competition') {
    return (
      <CompetitionExperience
        experience={experience}
        competition={data.competitions[experience.id]}
        entries={data.competitionEntries[experience.id] ?? []}
        refresh={refresh}
        onBack={onBack}
      />
    );
  }

  if (experience.mode === 'scenario') {
    return (
      <ScenarioExperience
        eventId={data.event.id}
        experience={experience}
        scenarios={data.prompts[experience.id] ?? []}
        entries={data.scenarioEntries[experience.id] ?? []}
        refresh={refresh}
        onBack={onBack}
      />
    );
  }

  return (
    <PromptExperience
      experience={experience}
      prompts={data.prompts[experience.id] ?? []}
      onBack={onBack}
    />
  );
}

function PromptExperience({ experience, prompts, onBack }: { experience: Experience; prompts: Prompt[]; onBack: () => void }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(prompts.length, 1)));
  const prompt = prompts[index] ?? null;

  function another() {
    if (prompts.length <= 1) return;
    let next = index;
    while (next === index) next = Math.floor(Math.random() * prompts.length);
    setIndex(next);
  }

  return (
    <section>
      <button className="back" onClick={onBack}>← Back to experiences</button>
      <div className="panel">
        <div className="category">{experience.title}</div>
        {prompt ? (
          <>
            <p className="prompt">{prompt.body}</p>
            {prompt.note && <p className="note">{prompt.note}</p>}
            {prompts.length > 1 && <button className="secondary" onClick={another}>Give me another</button>}
          </>
        ) : (
          <p className="note">No prompts have been added for this experience yet.</p>
        )}
      </div>
    </section>
  );
}

function ScenarioExperience({
  eventId,
  experience,
  scenarios,
  entries,
  refresh,
  onBack,
}: {
  eventId: string;
  experience: Experience;
  scenarios: Prompt[];
  entries: ScenarioEntry[];
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(scenarios.length, 1)));
  const [groupName, setGroupName] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const scenario = scenarios[index] ?? null;

  const config = experience.config ?? {};
  const outcome = config.scenario_outcome === 'share' || config.scenario_outcome === 'vote'
    ? config.scenario_outcome
    : 'conversation';
  const minimumEntries = typeof config.scenario_minimum_entries === 'number'
    ? Math.max(2, config.scenario_minimum_entries)
    : 3;
  const instruction = typeof config.scenario_instruction === 'string'
    ? config.scenario_instruction
    : 'Use only skills someone in your group actually has.';
  const shareMessage = typeof config.scenario_share_message === 'string'
    ? config.scenario_share_message
    : 'Your plan is saved for the host to share later.';
  const voteMessage = typeof config.scenario_vote_message === 'string'
    ? config.scenario_vote_message
    : 'Voting opens once enough plans are submitted.';

  const scenarioEntries = useMemo(
    () => scenario ? entries.filter((entry) => entry.prompt_id === scenario.id) : [],
    [entries, scenario?.id],
  );
  const votingOpen = outcome === 'vote' && scenarioEntries.length >= minimumEntries;
  const sortedEntries = useMemo(
    () => [...scenarioEntries].sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at)),
    [scenarioEntries],
  );

  function another() {
    if (scenarios.length <= 1) return;
    let next = index;
    while (next === index) next = Math.floor(Math.random() * scenarios.length);
    setIndex(next);
    setPlan('');
    setGroupName('');
    setMessage('');
    setError('');
  }

  async function submitPlan() {
    if (!scenario || !plan.trim() || outcome === 'conversation') return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/scenario/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          experienceId: experience.id,
          promptId: scenario.id,
          groupName,
          plan,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save your plan.');
      setPlan('');
      setGroupName('');
      setMessage(outcome === 'vote' ? voteMessage : shareMessage);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan.');
    } finally {
      setBusy(false);
    }
  }

  async function vote(entryId: string) {
    if (!scenario || !votingOpen) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/scenario/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entryId,
          experienceId: experience.id,
          promptId: scenario.id,
          deviceToken: getDeviceToken(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not record vote.');
      setMessage('Vote recorded.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record vote.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <button className="back" onClick={onBack}>← Back to experiences</button>
      <div className="panel">
        <div className="category">{experience.title}</div>
        {scenario ? (
          <>
            <div className="scenarioRule">
              <strong>One rule</strong>
              <span>{instruction}</span>
            </div>
            <p className="prompt">{scenario.body}</p>
            {scenario.note && <p className="note">{scenario.note}</p>}

            {outcome === 'conversation' ? (
              <>
                <div className="status">Talk it through together. Nothing to submit. The point is the conversation.</div>
                {scenarios.length > 1 && <button className="secondary" onClick={another}>Give us another scenario</button>}
              </>
            ) : (
              <>
                <input className="textInput" maxLength={40} placeholder="Group or table name (optional)" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                <textarea className="textArea" maxLength={1600} placeholder="What's your plan?" value={plan} onChange={(e) => setPlan(e.target.value)} />
                <button className="primary" disabled={busy || !plan.trim()} onClick={submitPlan}>{busy ? 'Saving…' : 'Submit our plan'}</button>

                {outcome === 'share' && <div className="status">Plans are saved so the host can decide whether to read them aloud later.</div>}
                {outcome === 'vote' && (
                  <div className="status">
                    {votingOpen
                      ? `${scenarioEntries.length} plans are in. Voting is open.`
                      : `${scenarioEntries.length} ${scenarioEntries.length === 1 ? 'plan' : 'plans'} in. Voting opens after ${Math.max(0, minimumEntries - scenarioEntries.length)} more.`}
                  </div>
                )}

                {message && <div className="status">{message}</div>}
                {error && <div className="error">{error}</div>}

                {sortedEntries.map((entry) => (
                  <div className="entry" key={entry.id}>
                    <div className="entryText">{entry.plan}</div>
                    {entry.group_name && <div className="tiny" style={{ textAlign: 'left', marginTop: 8 }}>Submitted by {entry.group_name}</div>}
                    {votingOpen && (
                      <button className="voteBtn" disabled={busy} onClick={() => vote(entry.id)}>
                        Vote for this plan • {entry.votes} {entry.votes === 1 ? 'vote' : 'votes'}
                      </button>
                    )}
                  </div>
                ))}

                {scenarios.length > 1 && <button className="secondary" onClick={another}>Try another scenario</button>}
              </>
            )}
          </>
        ) : (
          <p className="note">No scenarios have been added for this experience yet.</p>
        )}
      </div>
    </section>
  );
}

function getPlayerSecret() {
  const key = 'interactive-event-trivia-secret';
  let secret = window.localStorage.getItem(key);
  if (!secret) {
    secret = crypto.randomUUID();
    window.localStorage.setItem(key, secret);
  }
  return secret;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json as T;
}

type AnswerResult = { correct: boolean; pointsAwarded: number };

function TriviaExperience({ experience, onBack }: { experience: Experience; onBack: () => void }) {
  const [state, setState] = useState<TriviaState | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [question, setQuestion] = useState<OpenedQuestion | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadState = useCallback(async (onLoad = false) => {
    try {
      const next = await postJson<TriviaState>('/api/trivia/state', {
        experienceId: experience.id,
        playerSecret: getPlayerSecret(),
        onLoad,
      });
      setState(next);
      setClockOffset(Date.parse(next.now) - Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trivia.');
    }
  }, [experience.id]);

  // First load forfeits anything left open (reload / came back later).
  useEffect(() => {
    setName(window.localStorage.getItem('interactive-event-trivia-name') ?? '');
    void loadState(true);
  }, [loadState]);

  // Keep the leaderboard fresh while on the board.
  useEffect(() => {
    if (question) return;
    const t = window.setInterval(() => void loadState(), 15000);
    return () => window.clearInterval(t);
  }, [question, loadState]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const closesAtMs = state?.window.closesAt ? Date.parse(state.window.closesAt) : null;
  const remainingMs = closesAtMs === null ? null : closesAtMs - (nowTick + clockOffset);
  const status = state
    ? state.window.status === 'live' && remainingMs !== null && remainingMs <= 0 ? 'closed' : state.window.status
    : 'waiting';

  // When the countdown hits zero, fetch the final results.
  useEffect(() => {
    if (state?.window.status === 'live' && status === 'closed') void loadState();
  }, [status, state?.window.status, loadState]);

  // Anti-cheat: leaving the screen while a question is showing makes it disappear.
  useEffect(() => {
    if (!question || result) return;
    const attemptId = question.attemptId;
    const forfeit = () => {
      const payload = JSON.stringify({ attemptId, playerSecret: getPlayerSecret() });
      navigator.sendBeacon('/api/trivia/forfeit', new Blob([payload], { type: 'application/json' }));
      setQuestion(null);
      setGone(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') forfeit();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', forfeit);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', forfeit);
    };
  }, [question, result]);

  async function openTile(category: string, points: number) {
    if (busy) return;
    const trimmed = name.trim();
    if (!state?.player && !trimmed) {
      setError('Enter your name first.');
      return;
    }
    setBusy(true);
    setError('');
    setGone(false);
    setResult(null);
    try {
      if (trimmed) window.localStorage.setItem('interactive-event-trivia-name', trimmed);
      const q = await postJson<OpenedQuestion>('/api/trivia/open', {
        experienceId: experience.id,
        playerSecret: getPlayerSecret(),
        displayName: trimmed,
        category,
        points,
      });
      setQuestion(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that question.');
      void loadState();
    } finally {
      setBusy(false);
    }
  }

  async function answer(choice: number) {
    if (!question || busy || result) return;
    setBusy(true);
    setError('');
    try {
      const r = await postJson<AnswerResult>('/api/trivia/answer', {
        attemptId: question.attemptId,
        playerSecret: getPlayerSecret(),
        choice,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit answer.');
      setQuestion(null);
    } finally {
      setBusy(false);
      void loadState();
    }
  }

  function backToBoard() {
    setQuestion(null);
    setResult(null);
  }

  function leave() {
    if (question && !result) {
      const payload = JSON.stringify({ attemptId: question.attemptId, playerSecret: getPlayerSecret() });
      navigator.sendBeacon('/api/trivia/forfeit', new Blob([payload], { type: 'application/json' }));
    }
    onBack();
  }

  const clock = (
    <div className="triviaClock" role="timer" aria-live="off">
      {status === 'waiting' && (
        <>
          <strong>{formatClock((state?.window.durationMinutes ?? 120) * 60000)}</strong>
          <span>on the clock. It starts with the first answer.</span>
        </>
      )}
      {status === 'live' && remainingMs !== null && (
        <>
          <strong>{formatClock(remainingMs)}</strong>
          <span>remaining</span>
        </>
      )}
      {status === 'closed' && (
        <>
          <strong>Time&apos;s up</strong>
          <span>Final results below</span>
        </>
      )}
    </div>
  );

  if (question) {
    return (
      <section>
        <button className="back" onClick={leave}>← Leave (forfeits this question)</button>
        <div className="panel">
          <div className="category">{question.categoryLabel} • {question.points} {question.points === 1 ? 'point' : 'points'}</div>
          <p className="prompt">{question.question}</p>
          <div className="choices">
            {question.answers.map((a, i) => (
              <button key={`${i}-${a}`} className="choice" disabled={busy || !!result} onClick={() => answer(i)}>{a}</button>
            ))}
          </div>
          {!result && <p className="tiny">Take your time. But if you leave this screen, the question disappears and scores zero.</p>}
          {result && (
            <>
              <div className={result.correct ? 'status resultGood' : 'status resultBad'} role="status">
                {result.correct ? `Correct! +${result.pointsAwarded}` : 'Not this time. 0 points.'}
              </div>
              <button className="primary" onClick={backToBoard}>Back to the board</button>
            </>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      </section>
    );
  }

  return (
    <section>
      <button className="back" onClick={onBack}>← Back to experiences</button>
      <div className="panel">
        <div className="category">{experience.title}</div>
        {clock}

        {gone && <div className="error">That question disappeared because you left the screen. It counts as zero.</div>}
        {error && <div className="error">{error}</div>}

        {!state ? (
          <p className="note">Loading the board…</p>
        ) : (
          <>
            {status !== 'closed' && (
              <>
                {state.player ? (
                  <p className="note">Playing as <strong>{state.player.name}</strong> • {state.player.points} {state.player.points === 1 ? 'point' : 'points'}</p>
                ) : (
                  <input
                    className="textInput"
                    value={name}
                    maxLength={32}
                    placeholder="Your name for the leaderboard"
                    aria-label="Your name for the leaderboard"
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
                <p className="note">Pick a category and a point value. Questions are not timed, but leaving the screen during a question makes it disappear.</p>
                <div className="board">
                  {state.board.map((cat) => (
                    <div className="boardRow" key={cat.key}>
                      <div className="boardLabel">{cat.label}</div>
                      <div className="boardTiles">
                        {cat.tiles.map((tile) => (
                          <button
                            key={tile.points}
                            className="tile"
                            disabled={busy || tile.remaining === 0}
                            onClick={() => openTile(cat.key, tile.points)}
                            aria-label={`${cat.label}, ${tile.points} ${tile.points === 1 ? 'point' : 'points'}, ${tile.remaining} left`}
                          >
                            <strong>{tile.points}</strong>
                            <span>{tile.remaining === 0 ? 'done' : `${tile.remaining} left`}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <Leaderboard state={state} final={status === 'closed'} />
          </>
        )}
      </div>
    </section>
  );
}

function Leaderboard({ state, final }: { state: TriviaState; final: boolean }) {
  const { overall, categories } = state.leaderboard;
  const winner = final ? overall.find((r) => r.points > 0) : undefined;
  return (
    <div className="leaderboard">
      {winner && (
        <div className="winner">
          <span>Overall winner</span>
          <strong>🏆 {winner.name}</strong>
          <span>{winner.points} points</span>
        </div>
      )}
      <h3>{final ? 'Final standings' : 'Live leaderboard'}</h3>
      {overall.length === 0 ? (
        <p className="note">No answers yet.</p>
      ) : overall.map((row, i) => (
        <div className={row.isYou ? 'leaderRow you' : 'leaderRow'} key={`${row.name}-${i}`}>
          <span>{i + 1}. {row.name}{row.isYou ? ' (you)' : ''}</span>
          <strong>{row.points}</strong>
        </div>
      ))}
      <h3 className="leaderSub">{final ? 'Category champions' : 'Category leaders'}</h3>
      {categories.map((c) => (
        <div className="leaderRow" key={c.key}>
          <span>{c.label}</span>
          <strong>{c.leader ? `${c.leader.name} • ${c.leader.points}` : '—'}</strong>
        </div>
      ))}
      <p className="tiny">Ties go to whoever reached the score first.</p>
    </div>
  );
}

function CompetitionExperience({
  experience,
  competition,
  entries,
  refresh,
  onBack,
}: {
  experience: Experience;
  competition: Competition | null;
  entries: CompetitionEntry[];
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [textEntry, setTextEntry] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const votingOpen = !!competition && competition.voting_enabled && entries.length >= competition.minimum_entries;

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at)), [entries]);

  async function submitEntry() {
    if (!competition) return;
    if (competition.entry_type === 'text' && !textEntry.trim()) return;
    if (competition.entry_type === 'photo' && !file) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      let mediaUrl: string | null = null;
      if (competition.entry_type === 'photo' && file) {
        const form = new FormData();
        form.set('file', file);
        form.set('competitionId', competition.id);
        const upload = await fetch('/api/competition/upload', { method: 'POST', body: form });
        const uploadJson = await upload.json();
        if (!upload.ok) throw new Error(uploadJson.error || 'Upload failed.');
        mediaUrl = uploadJson.url;
      }

      const res = await fetch('/api/competition/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competitionId: competition.id, displayName, textEntry, mediaUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not submit entry.');

      setTextEntry('');
      setFile(null);
      setMessage('Your entry is in.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit entry.');
    } finally {
      setBusy(false);
    }
  }

  async function vote(entryId: string) {
    if (!competition) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/competition/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competitionId: competition.id, entryId, deviceToken: getDeviceToken() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not record vote.');
      setMessage('Vote recorded.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record vote.');
    } finally {
      setBusy(false);
    }
  }

  if (!competition) {
    return (
      <section>
        <button className="back" onClick={onBack}>← Back to experiences</button>
        <div className="panel"><p className="note">This competition has not been configured yet.</p></div>
      </section>
    );
  }

  const remaining = Math.max(0, competition.minimum_entries - entries.length);

  return (
    <section>
      <button className="back" onClick={onBack}>← Back to experiences</button>
      <div className="panel">
        <div className="category">{experience.title}</div>
        <p className="prompt">{competition.title}</p>
        <p className="note">{competition.prompt}</p>

        <input className="textInput" maxLength={32} placeholder="Name or nickname (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

        {competition.entry_type === 'text' ? (
          <textarea className="textArea" maxLength={1000} placeholder="Type your entry here…" value={textEntry} onChange={(e) => setTextEntry(e.target.value)} />
        ) : (
          <input className="fileInput" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        )}

        <button className="primary" disabled={busy || (competition.entry_type === 'text' ? !textEntry.trim() : !file)} onClick={submitEntry}>{busy ? 'Working…' : 'Submit entry'}</button>

        <div className="status">
          {votingOpen
            ? `${entries.length} entries are in. Voting is open.`
            : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} so far. Voting opens after ${remaining} more ${remaining === 1 ? 'entry' : 'entries'}.`}
        </div>

        {message && <div className="status">{message}</div>}
        {error && <div className="error">{error}</div>}

        {sortedEntries.map((entry) => (
          <div className="entry" key={entry.id}>
            {entry.media_url && <img className="entryImg" src={entry.media_url} alt="Competition entry" />}
            {entry.text_entry && <div className="entryText">{entry.text_entry}</div>}
            {entry.display_name && <div className="tiny" style={{ textAlign: 'left', marginTop: 8 }}>Submitted by {entry.display_name}</div>}
            {votingOpen && (
              <button className="voteBtn" disabled={busy} onClick={() => vote(entry.id)}>Vote for this • {entry.votes} {entry.votes === 1 ? 'vote' : 'votes'}</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

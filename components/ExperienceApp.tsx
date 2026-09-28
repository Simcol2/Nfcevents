'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import type {
  Competition,
  CompetitionEntry,
  EventPayload,
  Experience,
  Prompt,
  TriviaQuestion,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trivia_scores', filter: `event_id=eq.${data.event.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_entries' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_votes' }, () => void load())
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
      <TriviaExperience
        eventId={data.event.id}
        experience={experience}
        questions={data.trivia[experience.id] ?? []}
        leaderboard={data.leaderboard}
        refresh={refresh}
        onBack={onBack}
      />
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

function TriviaExperience({
  eventId,
  experience,
  questions,
  leaderboard,
  refresh,
  onBack,
}: {
  eventId: string;
  experience: Experience;
  questions: TriviaQuestion[];
  leaderboard: EventPayload['leaderboard'];
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [locked, setLocked] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');

  const question = questions[qIndex];

  const advance = useCallback(() => {
    if (qIndex + 1 >= questions.length) {
      setFinished(true);
      setStarted(false);
      return;
    }
    setQIndex((x) => x + 1);
    setChosen(null);
    setLocked(false);
  }, [qIndex, questions.length]);

  useEffect(() => {
    if (!started || !question || locked) return;
    setSeconds(question.time_limit_seconds);
    const timer = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(timer);
          setLocked(true);
          window.setTimeout(advance, 700);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [started, qIndex, question?.id, locked, advance]);

  useEffect(() => {
    if (!finished) return;
    const submit = async () => {
      const res = await fetch('/api/trivia/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          experienceId: experience.id,
          displayName: name,
          deviceToken: getDeviceToken(),
          score,
        }),
      });
      const json = await res.json();
      if (!res.ok) setSubmitError(json.error || 'Could not save score.');
      else await refresh();
    };
    void submit();
  }, [finished]); // intentional: submit once when game completes

  function choose(answerIndex: number) {
    if (locked || !question) return;
    setChosen(answerIndex);
    setLocked(true);
    if (answerIndex === question.correct_index) {
      setScore((s) => s + question.points_base + seconds * question.speed_bonus_per_second);
    }
    window.setTimeout(advance, 850);
  }

  function start() {
    if (!name.trim() || !questions.length) return;
    setScore(0);
    setQIndex(0);
    setFinished(false);
    setLocked(false);
    setChosen(null);
    setStarted(true);
  }

  return (
    <section>
      <button className="back" onClick={onBack}>← Back to experiences</button>
      <div className="panel">
        <div className="category">{experience.title}</div>

        {!started && !finished && (
          <>
            <p className="prompt">{questions.length} questions. Timed.</p>
            <p className="note">Your score joins the live dinner leaderboard.</p>
            <input className="textInput" value={name} maxLength={32} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
            <button className="primary" disabled={!name.trim() || !questions.length} onClick={start}>Start challenge</button>
          </>
        )}

        {started && question && (
          <>
            <div className="timer">{seconds}</div>
            <div className="progress"><div className="progressBar" style={{ width: `${Math.max(0, (seconds / question.time_limit_seconds) * 100)}%` }} /></div>
            <p className="prompt" style={{ marginTop: 22 }}>{question.question}</p>
            <div className="choices">
              {question.answers.map((answer, i) => {
                const cls = chosen === null
                  ? 'choice'
                  : i === question.correct_index
                    ? 'choice correct'
                    : i === chosen
                      ? 'choice wrong'
                      : 'choice';
                return <button key={answer} className={cls} disabled={locked} onClick={() => choose(i)}>{answer}</button>;
              })}
            </div>
            <div className="scoreMeta">Question {qIndex + 1} of {questions.length} • Score {score}</div>
          </>
        )}

        {finished && (
          <>
            <p className="prompt">{name}, you scored {score}.</p>
            {submitError && <div className="error">{submitError}</div>}
            <Leaderboard rows={leaderboard} />
            <button className="secondary" onClick={onBack}>Choose another experience</button>
          </>
        )}
      </div>
    </section>
  );
}

function Leaderboard({ rows }: { rows: EventPayload['leaderboard'] }) {
  return (
    <div className="leaderboard">
      <h3>Live leaderboard</h3>
      {rows.length === 0 ? <p className="note">No completed scores yet.</p> : rows.map((row, i) => (
        <div className="leaderRow" key={`${row.display_name}-${row.completed_at}-${i}`}>
          <span>{i + 1}. {row.display_name}</span>
          <strong>{row.score}</strong>
        </div>
      ))}
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

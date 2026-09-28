'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  Experience,
  Prompt,
  ScenarioBuilder,
  ScenarioEntry,
  ScenarioField,
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

type Draft = {
  promptId: string;
  groupName: string;
  roleAssignments: Record<string, string>;
  answers: Record<string, unknown>;
  step: number;
};

function draftKey(experienceId: string) {
  return `interactive-event-scenario-draft-${experienceId}`;
}

function readDraft(experienceId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(experienceId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function normalizeBuilder(value: unknown): ScenarioBuilder | null {
  if (!value || typeof value !== 'object') return null;
  const builder = value as ScenarioBuilder;
  if (!Array.isArray(builder.roles) && !Array.isArray(builder.fields)) return null;
  return builder;
}

function isComplete(field: ScenarioField, value: unknown) {
  if (!field.required) return true;
  if (field.type === 'multiselect') return Array.isArray(value) && value.length > 0;
  return String(value ?? '').trim().length > 0;
}

export default function ScenarioExperience({
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
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{ style: 'news' | 'police'; text: string } | null>(null);
  const [plan, setPlan] = useState('');
  const [restored, setRestored] = useState(false);

  // Pick up an unfinished plan where the group left off.
  useEffect(() => {
    const draft = readDraft(experience.id);
    const at = draft ? scenarios.findIndex((s) => s.id === draft.promptId) : -1;
    if (draft && at >= 0) {
      setIndex(at);
      setGroupName(draft.groupName ?? '');
      setRoleAssignments(draft.roleAssignments ?? {});
      setAnswers(draft.answers ?? {});
      setStep(draft.step ?? 0);
    }
    setRestored(true);
    // Only on first load for this experience.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experience.id]);

  const scenario = scenarios[index] ?? null;
  const builder = normalizeBuilder(scenario?.builder);

  // Save wizard progress on this device so leaving does not lose the plan.
  useEffect(() => {
    if (!restored || !scenario || !builder || summary) return;
    try {
      const draft: Draft = { promptId: scenario.id, groupName, roleAssignments, answers, step };
      window.localStorage.setItem(draftKey(experience.id), JSON.stringify(draft));
    } catch {
      // Storage unavailable (private mode): progress just is not kept.
    }
  }, [restored, scenario, builder, summary, groupName, roleAssignments, answers, step, experience.id]);

  const config = experience.config ?? {};
  const outcome = config.scenario_outcome === 'vote' || config.scenario_outcome === 'share'
    ? config.scenario_outcome
    : 'conversation';
  const minimumEntries = typeof config.scenario_minimum_entries === 'number'
    ? Math.max(2, config.scenario_minimum_entries)
    : 3;
  const instruction = typeof config.scenario_instruction === 'string'
    ? config.scenario_instruction
    : 'Use only skills someone in your group actually has.';

  const scenarioEntries = useMemo(
    () => (scenario ? entries.filter((entry) => entry.prompt_id === scenario.id) : []),
    [entries, scenario?.id],
  );
  const votingOpen = outcome === 'vote' && scenarioEntries.length >= minimumEntries;

  const wizardSteps = useMemo(() => {
    if (!builder) return [];
    const steps: Array<{ kind: 'group' | 'roles' | 'field' | 'review'; field?: ScenarioField }> = [
      { kind: 'group' },
    ];
    if (builder.roles?.length) steps.push({ kind: 'roles' });
    for (const field of builder.fields ?? []) steps.push({ kind: 'field', field });
    steps.push({ kind: 'review' });
    return steps;
  }, [builder]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey(experience.id));
    } catch {
      // ignore
    }
  }

  function resetForScenario(nextIndex: number) {
    clearDraft();
    setIndex(nextIndex);
    setPlan('');
    setGroupName('');
    setRoleAssignments({});
    setAnswers({});
    setStep(0);
    setSummary(null);
    setMessage('');
    setError('');
  }

  function another() {
    if (scenarios.length <= 1) return;
    let next = index;
    while (next === index) next = Math.floor(Math.random() * scenarios.length);
    resetForScenario(next);
  }

  function setAnswer(key: string, value: unknown) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function toggleMulti(field: ScenarioField, option: string) {
    const current = Array.isArray(answers[field.key]) ? (answers[field.key] as string[]) : [];
    setAnswer(
      field.key,
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  function canContinue() {
    const current = wizardSteps[step];
    if (!current) return false;
    if (current.kind === 'group') return groupName.trim().length > 0;
    if (current.kind === 'roles') {
      const required = builder?.roles?.filter((role) => role.required) ?? [];
      return required.every((role) => String(roleAssignments[role.key] ?? '').trim());
    }
    if (current.kind === 'field' && current.field) {
      return isComplete(current.field, answers[current.field.key]);
    }
    return true;
  }

  async function submitPlan() {
    if (!scenario || !builder || !groupName.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/scenario/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          experienceId: experience.id,
          promptId: scenario.id,
          groupName,
          answers: { roles: roleAssignments, ...answers },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save your plan.');
      clearDraft();
      setSummary(json.summary);
      setMessage('Your case file is saved.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your plan.');
    } finally {
      setBusy(false);
    }
  }

  async function submitFreeform() {
    if (!scenario || !plan.trim() || outcome === 'conversation') return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/scenario/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId, experienceId: experience.id, promptId: scenario.id, groupName, plan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save your plan.');
      setPlan('');
      const shareMessage = typeof config.scenario_share_message === 'string' ? config.scenario_share_message : 'Your plan is saved for the host to share later.';
      const voteMessage = typeof config.scenario_vote_message === 'string' ? config.scenario_vote_message : 'Voting opens once enough plans are submitted.';
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

  function renderField(field: ScenarioField) {
    const value = answers[field.key];

    if (field.type === 'textarea') {
      return (
        <textarea
          className="textArea"
          maxLength={900}
          placeholder={field.placeholder ?? ''}
          value={String(value ?? '')}
          onChange={(e) => setAnswer(field.key, e.target.value)}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <div className="scenarioChoiceGrid">
          {(field.options ?? []).map((option) => (
            <button
              type="button"
              key={option}
              className={`scenarioChoice ${value === option ? 'selected' : ''}`}
              onClick={() => setAnswer(field.key, option)}
            >
              {option}
            </button>
          ))}
        </div>
      );
    }

    if (field.type === 'multiselect') {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="scenarioChoiceGrid">
          {(field.options ?? []).map((option) => (
            <button
              type="button"
              key={option}
              className={`scenarioChoice ${selected.includes(option) ? 'selected' : ''}`}
              onClick={() => toggleMulti(field, option)}
            >
              {option}
            </button>
          ))}
        </div>
      );
    }

    return (
      <input
        className="textInput"
        type={field.type === 'date' ? 'date' : 'text'}
        maxLength={field.type === 'text' ? 180 : undefined}
        placeholder={field.placeholder ?? ''}
        value={String(value ?? '')}
        onChange={(e) => setAnswer(field.key, e.target.value)}
      />
    );
  }

  if (!scenario) {
    return (
      <section>
        <button className="back" onClick={onBack}>← Back to experiences</button>
        <div className="panel"><p className="note">No scenarios have been added yet.</p></div>
      </section>
    );
  }

  if (!builder) {
    const sortedEntries = [...scenarioEntries].sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at));
    return (
      <section>
        <button className="back" onClick={onBack}>← Back to experiences</button>
        <div className="panel">
          <div className="category">{experience.title}</div>
          <div className="scenarioRule"><strong>One rule</strong><span>{instruction}</span></div>
          <p className="prompt">{scenario.body}</p>
          {scenario.note && <p className="note">{scenario.note}</p>}

          {outcome === 'conversation' ? (
            <div className="status">Talk it through together. Nothing to submit. The point is the conversation.</div>
          ) : (
            <>
              <input className="textInput" maxLength={40} placeholder="Group or table name (optional)" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              <textarea className="textArea" maxLength={1600} placeholder="What's your plan?" value={plan} onChange={(e) => setPlan(e.target.value)} />
              <button className="primary" disabled={busy || !plan.trim()} onClick={submitFreeform}>{busy ? 'Saving…' : 'Submit our plan'}</button>
              {outcome === 'share' && <div className="status">Plans are saved so the host can decide whether to read them aloud later.</div>}
              {outcome === 'vote' && (
                <div className="status">
                  {votingOpen
                    ? `${scenarioEntries.length} plans are in. Voting is open.`
                    : `${scenarioEntries.length} ${scenarioEntries.length === 1 ? 'plan' : 'plans'} in. Voting opens after ${Math.max(0, minimumEntries - scenarioEntries.length)} more.`}
                </div>
              )}
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
            </>
          )}

          {message && <div className="status">{message}</div>}
          {error && <div className="error">{error}</div>}
          {scenarios.length > 1 && <button className="secondary" onClick={another}>Give us another scenario</button>}
        </div>
      </section>
    );
  }

  if (summary) {
    return (
      <section>
        <button className="back" onClick={onBack}>← Back to experiences</button>
        <div className="panel">
          <div className="category">{summary.style === 'news' ? 'BREAKING NEWS' : 'POLICE INCIDENT REPORT'}</div>
          <div className="scenarioSummary"><p>{summary.text}</p></div>
          {message && <div className="status">{message}</div>}
          {error && <div className="error">{error}</div>}
          {scenarios.length > 1 && <button className="secondary" onClick={another}>Try another scenario</button>}
        </div>
      </section>
    );
  }

  const current = wizardSteps[step];
  const progress = wizardSteps.length ? Math.round(((step + 1) / wizardSteps.length) * 100) : 0;

  return (
    <section>
      <button className="back" onClick={onBack}>← Back to experiences</button>
      <div className="panel">
        <div className="category">{experience.title}</div>
        <p className="prompt">{scenario.body}</p>
        <div className="scenarioRule"><strong>One rule</strong><span>{instruction}</span></div>

        <div className="scenarioProgress" aria-label={`Step ${step + 1} of ${wizardSteps.length}`}>
          <span style={{ width: `${progress}%` }} />
        </div>

        {current?.kind === 'group' && (
          <div className="scenarioStep">
            <div className="category">Name your crew</div>
            <p className="prompt">What should we call your table?</p>
            <p className="note">Use your table number or make up a crew name. This name appears in the final report.</p>
            <input
              className="textInput"
              maxLength={40}
              placeholder="Table 4 or The Leftover Bandits"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
        )}

        {current?.kind === 'roles' && (
          <div className="scenarioStep">
            <div className="category">Build the crew</div>
            <p className="prompt">Assign the jobs.</p>
            <p className="note">Leave a role blank if nobody at the table can actually do it. Your plan has to adapt.</p>
            <div className="roleList">
              {(builder.roles ?? []).map((role) => (
                <label className="roleRow" key={role.key}>
                  <span>
                    <strong>{role.label}</strong>
                    {role.description && <small>{role.description}</small>}
                  </span>
                  <input
                    className="textInput"
                    maxLength={60}
                    placeholder="Name"
                    value={roleAssignments[role.key] ?? ''}
                    onChange={(e) => setRoleAssignments((currentRoles) => ({ ...currentRoles, [role.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {current?.kind === 'field' && current.field && (
          <div className="scenarioStep">
            <div className="category">{current.field.section ?? 'Build the plan'}</div>
            <p className="prompt">{current.field.label}</p>
            {current.field.help && <p className="note">{current.field.help}</p>}
            {renderField(current.field)}
          </div>
        )}

        {current?.kind === 'review' && (
          <div className="scenarioStep">
            <div className="category">Final check</div>
            <p className="prompt">Ready to see how the story gets told?</p>
            <p className="note">Your plan will randomly become either a dramatic breaking-news report or a police incident report.</p>
            <div className="reviewBox">
              <strong>{groupName}</strong>
              <span>{Object.values(roleAssignments).filter(Boolean).length} crew roles assigned</span>
              <span>{Object.keys(answers).length} planning decisions recorded</span>
            </div>
            <button className="primary" disabled={busy} onClick={submitPlan}>
              {busy ? 'Generating report…' : 'Lock in our plan'}
            </button>
          </div>
        )}

        <div className="scenarioNav">
          {step > 0 && (
            <button type="button" className="secondary" onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>
          )}
          {current?.kind !== 'review' && (
            <button
              type="button"
              className="primary"
              disabled={!canContinue()}
              onClick={() => setStep((value) => Math.min(wizardSteps.length - 1, value + 1))}
            >
              Continue
            </button>
          )}
        </div>

        {scenarios.length > 1 && step === 0 && (
          <button className="secondary" onClick={another}>Give us another scenario</button>
        )}

        {outcome === 'vote' && votingOpen && (
          <div className="scenarioVoteList">
            <div className="status">Voting is open.</div>
            {scenarioEntries.map((entry) => (
              <div className="entry" key={entry.id}>
                <div className="entryText">{entry.summary_text || entry.plan}</div>
                {entry.group_name && <div className="tiny">Submitted by {entry.group_name}</div>}
                <button className="voteBtn" disabled={busy} onClick={() => vote(entry.id)}>
                  Vote • {entry.votes} {entry.votes === 1 ? 'vote' : 'votes'}
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </section>
  );
}

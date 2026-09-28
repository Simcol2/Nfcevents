export type Theme = {
  cream: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
};

export type Experience = {
  id: string;
  event_id: string;
  key: string;
  title: string;
  description: string;
  mode: 'prompt' | 'trivia' | 'competition' | 'scenario';
  sort_order: number;
  config: Record<string, unknown>;
};

export type Prompt = {
  id: string;
  experience_id: string;
  body: string;
  note: string | null;
  builder?: ScenarioBuilder | null;
};

export type ScenarioRole = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
};

export type ScenarioField = {
  key: string;
  section?: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'multiselect';
  help?: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
};

export type ScenarioBuilder = {
  title?: string;
  roles?: ScenarioRole[];
  fields?: ScenarioField[];
};

/** A revealed question as the guest sees it. The correct answer never leaves the server. */
export type OpenedQuestion = {
  attemptId: string;
  category: string;
  categoryLabel: string;
  points: number;
  question: string;
  answers: string[];
};

export type TriviaCategory = { key: string; label: string };

export type TriviaConfig = {
  categories: TriviaCategory[];
  pointValues: number[];
  durationMinutes: number;
  hardEndAt: string | null;
};

export type TriviaWindow = {
  status: 'waiting' | 'live' | 'closed';
  startedAt: string | null;
  closesAt: string | null;
  durationMinutes: number;
};

export type LeaderRow = { name: string; points: number; answered: number; isYou: boolean };

export type TriviaState = {
  now: string;
  window: TriviaWindow;
  player: { name: string; points: number; answered: number } | null;
  board: Array<{ key: string; label: string; tiles: Array<{ points: number; remaining: number }> }>;
  leaderboard: {
    overall: LeaderRow[];
    categories: Array<{ key: string; label: string; leader: LeaderRow | null }>;
  };
};

export type Competition = {
  id: string;
  experience_id: string;
  title: string;
  prompt: string;
  entry_type: 'text' | 'photo';
  minimum_entries: number;
  voting_enabled: boolean;
  max_votes_per_device: number;
};

export type CompetitionEntry = {
  id: string;
  competition_id: string;
  display_name: string | null;
  text_entry: string | null;
  media_url: string | null;
  created_at: string;
  votes: number;
};

export type ScenarioEntry = {
  id: string;
  experience_id: string;
  prompt_id: string;
  group_name: string | null;
  plan: string;
  answers: Record<string, unknown>;
  summary_style: 'news' | 'police' | null;
  summary_text: string | null;
  created_at: string;
  votes: number;
};

export type EventPayload = {
  event: {
    id: string;
    slug: string;
    name: string;
    subtitle: string | null;
    intro: string | null;
    theme: Theme;
  };
  experiences: Experience[];
  prompts: Record<string, Prompt[]>;
  competitions: Record<string, Competition | null>;
  competitionEntries: Record<string, CompetitionEntry[]>;
  scenarioEntries: Record<string, ScenarioEntry[]>;
};

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
  mode: 'prompt' | 'trivia' | 'competition';
  sort_order: number;
  config: Record<string, unknown>;
};

export type Prompt = {
  id: string;
  experience_id: string;
  body: string;
  note: string | null;
};

export type TriviaQuestion = {
  id: string;
  experience_id: string;
  question: string;
  answers: string[];
  correct_index: number;
  time_limit_seconds: number;
  points_base: number;
  speed_bonus_per_second: number;
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
  trivia: Record<string, TriviaQuestion[]>;
  competitions: Record<string, Competition | null>;
  competitionEntries: Record<string, CompetitionEntry[]>;
  leaderboard: Array<{ display_name: string; score: number; completed_at: string }>;
};

import type { OptionId } from './options';
import type { RoundOutcome, RoundType } from './decision';

export type SessionStatus = 'draft' | 'active' | 'decided' | 'archived';
export type RoundStatus = 'open' | 'closed' | 'published';
export type AccessMode = 'open' | 'codes';

export interface PublicRoundResult {
  roundId: string;
  number: number;
  type: RoundType;
  eligible: OptionId[];
  counts: Record<string, number>;
  percents: Record<string, number>;
  total: number;
  outcome: RoundOutcome;
  publishedAt: string;
}

export interface LiveDistribution {
  roundId: string;
  counts: Record<string, number>;
  percents: Record<string, number>;
  total: number;
}

export interface PublicRound {
  id: string;
  number: number;
  type: RoundType;
  status: RoundStatus;
  eligible: OptionId[];
  openedAt: string;
  closedAt: string | null;
}

export interface PublicDecision {
  optionId: OptionId;
  method: 'vote' | 'ceo';
  confirmedAt: string;
}

/** Всё, что видит участник и экран зала. Сырые голоса и промежуточное распределение сюда не попадают. */
export interface PublicState {
  session: {
    id: string;
    slug: string;
    title: string;
    status: SessionStatus;
    isDemo: boolean;
    accessMode: AccessMode;
    expectedParticipants: number | null;
    /** Вопрос, вынесенный на вече. */
    agenda: string;
    /** Показывать распределение голосов в реальном времени. */
    liveResults: boolean;
  };
  /** Текущее распределение голосов — только при включённом liveResults и до публикации итогов тура. */
  live: LiveDistribution | null;
  round: PublicRound | null;
  /** Число принятых голосов в текущем туре (без распределения). */
  voteCount: number;
  /** Только опубликованные организатором результаты, по турам. */
  results: PublicRoundResult[];
  decision: PublicDecision | null;
  serverTime: string;
}

export interface AdminRound extends PublicRound {
  voteCount: number;
  slots: number | null;
  carried: OptionId[];
  publishedAt: string | null;
  counts: Record<string, number> | null;
  percents: Record<string, number> | null;
  outcome: RoundOutcome | null;
}

export interface AdminSessionSummary {
  id: string;
  slug: string;
  title: string;
  status: SessionStatus;
  isDemo: boolean;
  createdAt: string;
}

export interface AdminState {
  session: PublicState['session'] & { createdAt: string; codesTotal: number; codesUsed: number };
  rounds: AdminRound[];
  decision: PublicDecision | null;
  volunteerCount: number;
  /** Что организатор может сделать следующим шагом. */
  next: NextStep;
}

export type NextStep =
  | { kind: 'start_main' }
  | { kind: 'close'; roundId: string }
  | { kind: 'publish'; roundId: string }
  | { kind: 'start_round'; type: 'tiebreak' | 'runoff'; eligible: OptionId[] }
  | { kind: 'tie'; optionIds: OptionId[] }
  | { kind: 'no_votes'; roundType: RoundType }
  | { kind: 'decide'; optionId: OptionId }
  | { kind: 'done' };

export type VoteResponse =
  | { status: 'accepted'; roundId: string; duplicate: boolean }
  | { status: 'error'; code: VoteErrorCode; message: string };

export type VoteErrorCode =
  | 'already_voted'
  | 'round_closed'
  | 'round_not_found'
  | 'invalid_option'
  | 'invalid_voter_key'
  | 'invalid_code'
  | 'rate_limited'
  | 'session_not_found';

export const GAME_DURATION: number;
export const WARMUP_DURATION: number;
export const MODE_SWITCH_MS: number;
export const SPEED_PRESETS: {
  id: string;
  label: string;
  hint: string;
  switchMs: number;
  comboEvery: number;
  tapLockMs: number;
}[];
export const DURATION_MIN: number;
export const DURATION_MAX: number;
export const CLUB_NAME: string;
export const COLORS: {
  id: "red" | "blue" | "green" | "yellow";
  label: string;
  hex: string;
  key: string[];
}[];
export const GRADE_LIST: string[];
export const DEPARTMENT_GROUPS: { college: string; items: string[] }[];
export const GUEST_PLAYER: {
  name: string;
  department: string;
  grade: string;
  phone: string;
  gatekeeper: string;
};
export const START_MODE_OPTIONS: { id: string; label: string }[];
export const DEFAULT_SETTINGS: GameSettings;
export function pointsForHit(combo: number): number;
export function accuracyOf(correct: number, total: number): number;
export function scoreIsConsistent(row: {
  score: number;
  correct: number;
  wrong: number;
  maxCombo: number;
}): boolean;
export function titleForScore(score: number, duration?: number): string;
export function theoreticalMaxScore(correct: number): number;
export function clampSettings(raw: unknown): GameSettings;
export function isOfficialSettings(raw: unknown): boolean;
export function settingsAreValid(raw: unknown): boolean;
export function nextQuestion(prev: unknown): {
  meaning: { id: string; label: string; hex: string };
  visual: { id: string; label: string; hex: string };
};
export function colorByKey(key: string): string | null;
export function correctId(game: LiveGame): string;
export function createLiveGame(
  now?: number,
  opts?: { skipSave?: boolean; settings?: unknown },
): LiveGame;
export function createWarmupGame(now?: number, settings?: Partial<GameSettings>): LiveGame;
export function emptyPlayer(): {
  name: string;
  department: string;
  grade: string;
  phone: string;
  gatekeeper: string;
};
export function judgeAnswer(
  game: LiveGame,
  chosen: string,
  snapshot: { mode: string; seq: number },
  now?: number,
): {
  ok: boolean;
  hit?: boolean;
  reason?: string;
  expected?: string;
  score?: number;
  combo?: number;
  delta?: number;
  switched?: boolean;
};
export function publicResult(
  game: LiveGame,
  player: { name: string; department: string; grade: string; phone: string; gatekeeper: string },
): Record<string, unknown> & {
  name: string;
  score: number;
  correct: number;
  wrong: number;
  accuracy: number;
  maxCombo: number;
  title: string;
  blurb: string;
  total: number;
  duration: number;
  skipSave: boolean;
  submissionId: string;
  kind: "official" | "practice" | "warmup";
  settings: GameSettings;
  completedAt: string | null;
};
export function remainingSeconds(game: LiveGame, now?: number): number;
export function tickGame(
  game: LiveGame,
  now?: number,
): { remaining: number; switched: boolean; expired: boolean };
export function validatePlayer(player: unknown):
  | {
      ok: true;
      errors: Record<string, string | undefined>;
      data: { name: string; department: string; grade: string; phone: string; gatekeeper: string };
    }
  | { ok: false; errors: Record<string, string | undefined>; data?: undefined };

export type GameSettings = {
  duration: number;
  switchMs: number;
  speed: string;
  comboEvery: number;
  tapLockMs: number;
  startMode: string;
  sound: boolean;
  vibrate: boolean;
};

export type LiveGame = {
  score: number;
  combo: number;
  maxCombo: number;
  correct: number;
  wrong: number;
  mode: "meaning" | "visual";
  lastModeSwitch: number;
  lastAnswerAt: number;
  questionSeq: number;
  startTime: number;
  lastClockTime: number;
  completedAt: string | null;
  ended: boolean;
  resultSubmitted: boolean;
  skipSave: boolean;
  kind: "official" | "practice" | "warmup";
  submissionId: string;
  duration: number;
  modeSwitchMs: number;
  comboEvery: number;
  tapLockMs: number;
  settings: GameSettings;
  question: {
    meaning: { id: string; label: string; hex: string };
    visual: { id: string; label: string; hex: string };
  };
};

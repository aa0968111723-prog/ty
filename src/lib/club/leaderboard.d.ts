export const LEADERBOARD_CACHE_MS: number;
export const LEADERBOARD_SCOPES: readonly ["today", "history"];
export const PUBLIC_ROW_KEYS: readonly ["rank", "displayName", "score", "accuracy", "title", "time"];
export function dateInTaipei(value: Date): string;
export function maskDisplayName(name: unknown): string;
export function playerKey(row: Record<string, unknown>): string;
export function compareLeaderboardRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number;
export function eligibleOfficialResults(rows: unknown[]): Array<Record<string, unknown>>;
export function bestResultsByPlayer(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
export function toPublicLeaderboardRow(
  row: Record<string, unknown>,
  rank: number,
  scope: "today" | "history",
): {
  rank: number;
  displayName: string;
  score: number;
  accuracy: number;
  title: string;
  time: string;
};
export function publicLeaderboardHasSensitiveData(payload: unknown): boolean;
export function buildPublicLeaderboard(input: {
  rows?: unknown[];
  scope: "today" | "history";
  now?: Date;
}): {
  ok: true;
  public: true;
  scope: "today" | "history";
  date: string;
  generatedAt: string;
  count: number;
  topThree: Array<{
    rank: number;
    displayName: string;
    score: number;
    accuracy: number;
    title: string;
    time: string;
  }>;
  rows: Array<{
    rank: number;
    displayName: string;
    score: number;
    accuracy: number;
    title: string;
    time: string;
  }>;
};
export function parseLeaderboardScope(request: Request):
  | { ok: true; scope: "today" | "history" }
  | { ok: false; error: string };
export function leaderboardCacheKey(scope: "today" | "history", date: string): string;
export function readLeaderboardCache(key: string, now?: number): Record<string, unknown> | null;
export function writeLeaderboardCache(key: string, body: Record<string, unknown>, now?: number): void;
export function invalidateLeaderboardCache(): void;

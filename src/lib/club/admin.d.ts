export interface AdminContact {
  name: string;
  phone: string;
  department: string;
  grade: string;
  gatekeeper: string;
  source: "Google Form" | "Focus Challenge";
  completedAt: string;
}
export interface OfficialResult extends AdminContact {
  id: string;
  submissionId: string;
  score: number;
  accuracy: number;
  correct: number;
  wrong: number;
  maxCombo: number;
  title: string;
  kind: "official";
  skipSave: false;
  duration: 60;
}
export interface SyncStatus {
  ok: boolean;
  error?: string;
}
export interface DashboardInput {
  date?: string;
  forms?: unknown[];
  results?: unknown[];
  sync?: { forms: SyncStatus; results: SyncStatus };
  now?: Date;
}
export interface AdminDashboard {
  ok: true;
  date: string;
  contacts: AdminContact[];
  results: OfficialResult[];
  topThree: OfficialResult[];
  kpis: {
    contacts: number;
    rawRecords: number;
    duplicates: number;
    officialChallenges: number;
    averageScore: number;
    highestScore: number;
    formResponses: number;
  };
  gatekeepers: { name: string; count: number }[];
  departments: { name: string; count: number }[];
  grades: { name: string; count: number }[];
  trend: { hour: string; count: number }[];
  sync: { forms: SyncStatus; results: SyncStatus; updatedAt: string };
}
export interface RecruitmentSyncStatus extends SyncStatus {
  stale?: boolean;
}
export interface RecruitmentDashboard {
  ok: true;
  date: string;
  summary: Record<string, number>;
  funnel: Array<{ id: string; label: string; count: number; fromPrevious: number | null; fromStart: number | null; missing?: boolean }>;
  pending: unknown[];
  profiles: unknown[];
  gameGatekeepers: unknown[];
  recruiters: unknown[];
  distributions: unknown;
  sync: {
    gameResults: RecruitmentSyncStatus;
    recruitmentResponses: RecruitmentSyncStatus;
    recruitmentMaster: RecruitmentSyncStatus;
    form: RecruitmentSyncStatus;
    updatedAt: string;
    tabs?: Record<string, string>;
  };
}
export function normalizeName(value: unknown): string;
export function normalizeFormResponse(value: unknown): AdminContact;
export function rankOfficialResults(rows: unknown[], date?: string): OfficialResult[];
export function buildDashboard(input?: DashboardInput): AdminDashboard;
export function handleAdminLogin(request: Request): Promise<Response>;
export function handleAdminLogout(request: Request): Promise<Response>;
export function handleAdminSession(request: Request): Promise<Response>;
export function handleAdminDashboard(request: Request): Promise<Response>;
export function handleAdminFormResponses(request: Request): Promise<Response>;
export function handleAdminResults(request: Request): Promise<Response>;
export function handleAdminRecruitment(request: Request): Promise<Response>;
export function handleAdminRecruitmentSubmit(request: Request): Promise<Response>;

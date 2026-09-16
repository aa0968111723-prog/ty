import { type AdminView } from "./admin-shell";

export type Contact = {
  name: string;
  phone: string;
  department: string;
  grade: string;
  gatekeeper: string;
  source: string;
  completedAt: string;
};
export type Result = Contact & {
  id: string;
  submissionId: string;
  score: number;
  accuracy: number;
  correct: number;
  maxCombo: number;
};
export type Count = { name: string; count: number };
export type Dashboard = {
  date: string;
  contacts: Contact[];
  results: Result[];
  topThree: Result[];
  historyTop?: Result[];
  kpis: {
    contacts: number;
    rawRecords: number;
    duplicates: number;
    officialChallenges: number;
    averageScore: number;
    highestScore: number;
    formResponses: number;
  };
  gatekeepers: Count[];
  departments: Count[];
  grades: Count[];
  trend: { hour: string; count: number }[];
  sync: {
    forms: { ok: boolean; error?: string };
    results: { ok: boolean; error?: string };
    updatedAt: string;
  };
};

export type Tab = AdminView;
export type WidgetId =
  | "todayContacts"
  | "dateContacts"
  | "official"
  | "practice"
  | "highest"
  | "average"
  | "topThree"
  | "gatekeepers"
  | "departments"
  | "grades"
  | "latestForms"
  | "recentPlayers"
  | "sync"
  | "system";
export type LayoutPreference = { visible: WidgetId[]; order: WidgetId[]; pinned: WidgetId[] };

export const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "todayContacts", label: "今日接觸人數" },
  { id: "dateContacts", label: "指定日期接觸人數" },
  { id: "official", label: "正式參賽人數" },
  { id: "practice", label: "試玩人數" },
  { id: "highest", label: "今日最高分" },
  { id: "average", label: "平均分數" },
  { id: "topThree", label: "前三名" },
  { id: "gatekeepers", label: "關主統計" },
  { id: "departments", label: "科系分布" },
  { id: "grades", label: "年級分布" },
  { id: "latestForms", label: "Google 表單最新資料" },
  { id: "recentPlayers", label: "最近參賽者" },
  { id: "sync", label: "Google Sheet 同步狀態" },
  { id: "system", label: "系統狀態" },
];
export const IDS = WIDGETS.map(({ id }) => id);
export const DEFAULT_LAYOUT: LayoutPreference = {
  visible: [...IDS],
  order: [...IDS],
  pinned: ["todayContacts", "topThree", "gatekeepers", "recentPlayers"],
};
export const STORAGE_KEY = "admin-dashboard-layout";

export function validIds(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((id): id is WidgetId => typeof id === "string" && IDS.includes(id as WidgetId)),
    ),
  ];
}
export function readLayout(): LayoutPreference {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!value || typeof value !== "object") return DEFAULT_LAYOUT;
    const order = validIds(value.order);
    const visible = validIds(value.visible);
    const pinned = validIds(value.pinned).filter((id) => visible.includes(id));
    return {
      order: [...order, ...IDS.filter((id) => !order.includes(id))],
      visible,
      pinned,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}
export function taipeiDate(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86400000));
}
export function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}
export function initialView(): Tab {
  if (typeof window === "undefined") return "recruitment";
  const view = new URLSearchParams(window.location.search).get("view");
  return (
    (
      {
        today: "recruitment",
        recruitment: "recruitment",
        pending: "pending",
        roster: "roster",
        ranking: "podium",
        "today-board": "podium",
        "history-board": "history",
        contacts: "roster",
        gatekeepers: "leaders",
        pinned: "pinned",
        form: "contacts",
        results: "results",
        sync: "system",
        security: "security",
      } as Record<string, Tab>
    )[view || ""] ?? "recruitment"
  );
}

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Filter } from "lucide-react";
import { RecruitmentProfileSheet, type RecruitmentProfile } from "./recruitment-profile-sheet";
import { BattleHome } from "./battle-home";
import {
  OFFICIAL_FORM_ID,
  OFFICIAL_RECRUITERS,
  OFFICIAL_VIEWFORM_URL,
  RECRUITER_STORAGE_KEY,
} from "@/lib/club/recruitment-prefill.mjs";
import { taipeiDate, time } from "./admin-presentation";

export type SyncFlag = { ok: boolean; stale?: boolean; error?: string };
export type DailyPoint = { date: string; contacts: number; signups: number; joins: number };
export type EventCount = { id: string; label: string; count: number };
export type RecruitmentData = {
  date: string;
  summary: {
    playedToday: number;
    contactsToday?: number;
    contactsCumulative?: number;
    eventSignupsToday?: number;
    pendingOfficialForm?: number;
    pending: number;
    pendingToday?: number;
    recruited: number;
    recruitedToday?: number;
    activity: number | null;
    joined: number | null;
    depositPaid: number | null;
    depositTotal: number | null;
    roster: number;
  };
  events?: EventCount[];
  daily?: DailyPoint[];
  funnel: Array<{
    id: string;
    label: string;
    count: number | null;
    fromPrevious: number | null;
    fromStart: number | null;
    missing?: boolean;
  }>;
  pending: Array<RecruitmentProfile & {
    waitMinutes: number | null;
    score: number;
    prefillUrl: string;
    gameGatekeeper: string;
    completedAt?: string;
    submissionId?: string;
    duplicateWarning?: string;
  }>;
  profiles: Array<RecruitmentProfile & { duplicateWarning?: string; normalizedPhone?: string }>;
  gameGatekeepers: Array<{
    name: string;
    played: number;
    pending: number;
    recruited: number;
    activity: number | null;
    joined: number | null;
  }>;
  recruiters: Array<{ name: string; count: number }>;
  sync: {
    gameResults: SyncFlag;
    recruitmentResponses: SyncFlag;
    recruitmentMaster: SyncFlag;
    form: SyncFlag;
    updatedAt: string;
    tabs?: {
      gameResults?: string;
      recruitmentResponses?: string;
      recruitmentMaster?: string;
    };
    links?: { game?: string };
  };
};

const HANDLED_KEY = "club-handled-pending";
const FORM_EDIT_URL = `https://docs.google.com/forms/d/${OFFICIAL_FORM_ID}/edit`;

function waitLabel(minutes: number | null) {
  if (minutes == null) return "時間未填";
  if (minutes < 60) return `已等 ${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `已等 ${hours} 時 ${rest} 分` : `已等 ${hours} 時`;
}

function rowMatchesQuery(
  row: { name?: string; phone?: string; department?: string; grade?: string },
  query: string,
) {
  const needle = query.trim();
  if (!needle) return true;
  return `${row.name} ${row.phone} ${row.department} ${row.grade}`.includes(needle);
}

function readHandled() {
  try {
    const raw = JSON.parse(localStorage.getItem(HANDLED_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function statusLabel(row: RecruitmentProfile) {
  if (row.pending) return "尚未填正式表單";
  if (row.joined !== "是") return "入社未完成";
  if (row.depositPaid !== "是") return "保證金未完成";
  return "已完成";
}

function followUpIncomplete(row: RecruitmentProfile) {
  if (row.pending) return true;
  return row.joined !== "是" || row.depositPaid !== "是";
}

function taipeiDayOf(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function rosterDayOf(row: RecruitmentProfile) {
  return taipeiDayOf(row.gameCompletedAt) || taipeiDayOf(row.submittedAt) || taipeiDayOf(row.recruitedAt);
}

export function RecruitmentDashboard({
  data,
  panel = "home",
  query,
  setQuery,
  gameGatekeeper,
  setGameGatekeeper,
  recruiter,
  setRecruiter,
  status,
  setStatus,
  error,
  busy,
  onOpenPending,
  onOpenRoster,
}: {
  data: RecruitmentData;
  panel?: "home" | "pending" | "roster";
  query: string;
  setQuery: (value: string) => void;
  gameGatekeeper: string;
  setGameGatekeeper: (value: string) => void;
  recruiter: string;
  setRecruiter: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  error?: string;
  busy?: boolean;
  onOpenPending?: () => void;
  onOpenRoster?: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const [activity, setActivity] = useState("");
  const [joined, setJoined] = useState("");
  const [deposit, setDeposit] = useState("");
  const [formFilled, setFormFilled] = useState("");
  const [rosterRange, setRosterRange] = useState<"today" | "yesterday" | "all" | "custom">("all");
  const [rosterDate, setRosterDate] = useState(taipeiDate());
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHandled(readHandled());
    if (recruiter) return;
    try {
      const stored = localStorage.getItem(RECRUITER_STORAGE_KEY) || "";
      if (stored && stored !== "其他") setRecruiter(stored);
    } catch {
      /* ignore */
    }
  }, [recruiter, setRecruiter]);
  useEffect(() => {
    if (!filtersOpen) return;
    filtersRef.current?.scrollIntoView({ block: "end", inline: "nearest" });
  }, [filtersOpen]);

  const events = data.events || [];
  const daily = data.daily || [];
  const board = { ...data, events, daily };

  const pending = useMemo(() => {
    return data.pending.filter((row) => {
      if (handled.has(row.personKey)) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.pending, gameGatekeeper, query, handled]);

  const followUps = useMemo(() => {
    return data.profiles.filter((row) => {
      if (!followUpIncomplete(row)) return false;
      if (row.pending) return false;
      if (handled.has(row.personKey)) return false;
      if (recruiter && !(row.recruiterList || []).includes(recruiter)) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.profiles, recruiter, gameGatekeeper, query, handled]);

  const people = useMemo(() => {
    const today = taipeiDate();
    const yesterday = taipeiDate(-1);
    return data.profiles.filter((row) => {
      const day = rosterDayOf(row);
      if (rosterRange === "today" && day !== today) return false;
      if (rosterRange === "yesterday" && day !== yesterday) return false;
      if (rosterRange === "custom" && rosterDate && day !== rosterDate) return false;
      if (status === "pending" && !followUpIncomplete(row)) return false;
      if (status === "done" && followUpIncomplete(row)) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (recruiter && !(row.recruiterList || []).includes(recruiter)) return false;
      if (activity && !(row.activity || "").includes(activity)) return false;
      if (joined === "yes" && row.joined !== "是") return false;
      if (joined === "no" && row.joined === "是") return false;
      if (deposit === "yes" && row.depositPaid !== "是") return false;
      if (deposit === "no" && row.depositPaid === "是") return false;
      if (formFilled === "yes" && row.pending) return false;
      if (formFilled === "no" && !row.pending) return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.profiles, status, gameGatekeeper, recruiter, activity, joined, deposit, formFilled, query, rosterRange, rosterDate]);

  function markHandled(personKey: string) {
    setHandled((current) => {
      const next = new Set(current);
      next.add(personKey);
      try { localStorage.setItem(HANDLED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  if (panel === "home") {
    return (
      <BattleHome
        data={board}
        error={error}
        busy={busy}
        onOpenPending={() => onOpenPending?.()}
        onOpenRoster={() => onOpenRoster?.()}
      />
    );
  }

  if (panel === "pending") {
    return (
      <div className="recruitment-board">
        <section className="admin-panel recruiter-compact" aria-label="這位有緣人的接引人">
          <h2>這位有緣人的接引人</h2>
          <select
            aria-label="選擇接引夥伴"
            value={recruiter}
            onChange={(event) => {
              const next = event.target.value;
              setRecruiter(next);
              try { localStorage.setItem(RECRUITER_STORAGE_KEY, next); } catch { /* ignore */ }
            }}
          >
            <option value="">尚未選擇</option>
            {OFFICIAL_RECRUITERS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p className="admin-caption">
            {recruiter ? `目前：${recruiter}` : "先選接引夥伴"}
            。遊戲關主不會變成正式接引人。
          </p>
        </section>
        <section className="admin-panel">
          <div className="admin-section-heading">
            <h2>需要你處理的同學</h2>
            <span className="admin-caption">{pending.length + followUps.length} 位</span>
          </div>
          <input
            aria-label="搜尋姓名或電話"
            placeholder="搜尋姓名、電話"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
            <option value="">全部關主</option>
            {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          {!pending.length && !followUps.length ? (
            <p className="admin-empty">{busy ? "讀取中…" : "目前沒有待處理同學"}</p>
          ) : (
            <div className="admin-person-list recruitment-pending">
              {[...pending, ...followUps].map((row) => (
                <article key={row.personKey}>
                  <div>
                    <strong>{row.name}</strong>
                    <span className="admin-badge">{statusLabel(row)}</span>
                  </div>
                  <a className="admin-primary" href={`/follow-up?personKey=${encodeURIComponent(row.personKey)}`}>
                    填寫正式資料
                  </a>
                  <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                  <p>{row.phone || "電話未填"}</p>
                  <small>
                    {row.gameCompletedAt || ("completedAt" in row && row.completedAt)
                      ? time(("completedAt" in row && row.completedAt) || row.gameCompletedAt || "")
                      : waitLabel("waitMinutes" in row ? row.waitMinutes ?? null : null)}
                    {" · 遊戲關主 "}{row.gameGatekeeper || "未填"}
                    {" · 接引人 "}{row.recruiters || "尚未指定"}
                  </small>
                  <p>
                    活動 {row.activity || "尚未填"} · 入社 {row.joined || "尚未填"} · 保證金 {row.depositPaid || "尚未填"}
                  </p>
                  {row.duplicateWarning ? <p className="admin-caption">{row.duplicateWarning}</p> : null}
                  <div className="recruitment-actions">
                    <a href={row.prefillUrl || OFFICIAL_VIEWFORM_URL} target="_blank" rel="noreferrer">
                      開啟正式招生表單 <ExternalLink size={16} />
                    </a>
                    <button type="button" onClick={() => markHandled(row.personKey)}>
                      <Check size={16} /> 標記已處理
                    </button>
                    <button type="button" onClick={() => setProfile(row)}>查看詳細資料</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <RecruitmentProfileSheet profile={profile} onClose={() => setProfile(null)} />
      </div>
    );
  }

  return (
    <div className="recruitment-board">
      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>同學名單</h2>
          <button type="button" className="admin-more-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
            <span><Filter size={18} /> 篩選</span>
            <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
          </button>
        </div>
        <input aria-label="搜尋姓名或電話" placeholder="搜尋姓名、電話" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div ref={filtersRef} className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
          <div className="battle-date-chips" role="group" aria-label="名單日期">
            {([
              ["today", "今天"],
              ["yesterday", "昨天"],
              ["all", "全部"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={rosterRange === id}
                onClick={() => setRosterRange(id)}
              >
                {label}
              </button>
            ))}
            <label>
              自訂日期
              <input
                aria-label="名單自訂日期"
                type="date"
                value={rosterDate}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setRosterDate(event.target.value);
                  setRosterRange("custom");
                }}
              />
            </label>
          </div>
          <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
            <option value="">所有遊戲關主</option>
            {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選招生接引人" value={recruiter} onChange={(event) => setRecruiter(event.target.value)}>
            <option value="">所有接引人</option>
            {data.recruiters.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="待追蹤或已完成" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部狀態</option>
            <option value="pending">待處理</option>
            <option value="done">已完成</option>
          </select>
          <select aria-label="篩選活動" value={activity} onChange={(event) => setActivity(event.target.value)}>
            <option value="">所有活動</option>
            {events.map((row) => <option key={row.id}>{row.label}</option>)}
          </select>
          <select aria-label="是否入社" value={joined} onChange={(event) => setJoined(event.target.value)}>
            <option value="">入社不限</option>
            <option value="yes">已入社</option>
            <option value="no">尚未入社</option>
          </select>
          <select aria-label="是否繳保證金" value={deposit} onChange={(event) => setDeposit(event.target.value)}>
            <option value="">保證金不限</option>
            <option value="yes">已繳</option>
            <option value="no">未繳</option>
          </select>
          <select aria-label="正式表單是否已填" value={formFilled} onChange={(event) => setFormFilled(event.target.value)}>
            <option value="">表單不限</option>
            <option value="yes">已填正式表單</option>
            <option value="no">尚未填正式表單</option>
          </select>
        </div>
        <p className="admin-caption">
          {people.length} 位 · {rosterRange === "today" ? "今天" : rosterRange === "yesterday" ? "昨天" : rosterRange === "custom" ? rosterDate : "全部"}
          {gameGatekeeper ? ` · 關主 ${gameGatekeeper}` : ""}
          {recruiter ? ` · 接引 ${recruiter}` : ""}
          {" · 僅工作人員可見"}
        </p>
        {!people.length ? (
          <p className="admin-empty">{busy ? "讀取中…" : "沒有符合條件的同學"}</p>
        ) : (
          <div className="admin-person-list">
            {people.map((row) => (
              <article key={row.personKey} role="button" tabIndex={0} onClick={() => setProfile(row)} onKeyDown={(event) => event.key === "Enter" && setProfile(row)}>
                <div>
                  <strong>{row.name}</strong>
                  <span className="admin-badge">{statusLabel(row)}</span>
                </div>
                <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                <p>遊戲關主 {row.gameGatekeeper || "未填"} · 接引人 {row.recruiters || "尚未填表"}</p>
                <p>活動 {row.activity || "尚未填"} · 入社 {row.joined || "尚未填"} · 保證金 {row.depositPaid || "尚未填"}</p>
                <small>{row.phone || "電話未填"}</small>
                {row.duplicateWarning ? <p className="admin-caption">{row.duplicateWarning}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
      <RecruitmentProfileSheet profile={profile} onClose={() => setProfile(null)} />
    </div>
  );
}

export function RecruitmentSync({ data }: { data: RecruitmentData }) {
  const items = [
    ["遊戲資料", data.sync.gameResults],
    ["招生表單", data.sync.form],
    ["招生狀況表", data.sync.recruitmentResponses],
    ["總表", data.sync.recruitmentMaster],
  ] as const;
  return (
    <dl className="admin-system">
      {items.map(([label, flag]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{flag.ok ? "● 正常" : flag.stale ? "○ 同步異常 · 顯示上次資料" : "○ 同步異常"}</dd>
        </Fragment>
      ))}
      <dt>最後同步</dt>
      <dd>{syncClock(data.sync.updatedAt)}</dd>
      <dt>正式招生表單</dt>
      <dd>
        <a className="admin-sheet-link" href={FORM_EDIT_URL} target="_blank" rel="noreferrer">
          查看招生表單後台 <ExternalLink size={16} />
        </a>
      </dd>
      {data.sync.links?.game ? (
        <>
          <dt>遊戲成績表</dt>
          <dd>
            <a className="admin-sheet-link" href={data.sync.links.game} target="_blank" rel="noreferrer">
              打開遊戲分頁 <ExternalLink size={16} />
            </a>
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function syncClock(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString("zh-TW", { hour12: false, timeZone: "Asia/Taipei" });
}

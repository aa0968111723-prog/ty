import { Fragment, useLayoutEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Filter } from "lucide-react";
import { isPersonHandled, markPersonHandled, readHandledPersonKeys } from "@/lib/club/pending-handled.mjs";
import { profileTouchesTaipeiDate, rosterFilterDate } from "@/lib/club/roster-date.mjs";
import { RecruitmentProfileSheet, type RecruitmentProfile } from "./recruitment-profile-sheet";
import { LIVE_ACTIVITY_CHOICES } from "@/lib/club/recruitment-prefill.mjs";

export type SyncFlag = { ok: boolean; stale?: boolean; error?: string };
export type RecruitmentTrendPoint = {
  date: string;
  contacts: number;
  signups: number;
  joined: number;
};
export type RecruitmentEventCount = { name: string; count: number };
export type RecruitmentData = {
  date: string;
  summary: {
    playedToday: number;
    playedOnDate?: number;
    playedAll?: number;
    pending: number;
    pendingToday?: number;
    recruited: number;
    recruitedToday?: number;
    activity: number | null;
    activityToday?: number | null;
    events?: RecruitmentEventCount[];
    joined: number | null;
    depositPaid: number | null;
    depositNeedsReview?: boolean;
    depositTotal: number | null;
    roster: number;
    conflicts?: number;
  };
  events?: RecruitmentEventCount[];
  trend?: RecruitmentTrendPoint[];
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
    needsReview?: boolean;
    prefillUrl: string;
    gameGatekeeper: string;
    completedAt?: string;
    submissionId?: string;
    status?: string;
  }>;
  profiles: Array<RecruitmentProfile & { needsReview?: boolean }>;
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

const HANDLED_KEY = "club-handled-people";
const REAL_EVENTS = LIVE_ACTIVITY_CHOICES.filter((name) => !/無|考慮中|沒興趣/.test(name));

function readHandled() {
  try {
    const raw = JSON.parse(localStorage.getItem(HANDLED_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeHandled(keys: Set<string>) {
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

function waitLabel(minutes: number | null | undefined) {
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

function yesNo(value?: string) {
  if (value === "是") return "是";
  if (value === "否") return "否";
  return "未填";
}

function clock(value?: string) {
  if (!value) return "時間未填";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function followUpHref(row: { personKey: string }) {
  return `/follow-up?${new URLSearchParams({ personKey: row.personKey }).toString()}`;
}

function relatedToPartner(
  row: { gameGatekeeper?: string; recruiterList?: string[]; recruiters?: string },
  recruiter: string,
) {
  if (!recruiter) return true;
  if (row.gameGatekeeper === recruiter) return true;
  if ((row.recruiterList || []).includes(recruiter)) return true;
  return String(row.recruiters || "")
    .split(/[、,，]/)
    .map((name) => name.trim())
    .includes(recruiter);
}

export function PendingQueue({
  data,
  query,
  setQuery,
  gameGatekeeper,
  setGameGatekeeper,
  recruiter,
}: {
  data: RecruitmentData;
  query: string;
  setQuery: (value: string) => void;
  gameGatekeeper: string;
  setGameGatekeeper: (value: string) => void;
  recruiter: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const [mineOnly, setMineOnly] = useState(Boolean(recruiter));
  const [handled, setHandled] = useState<Set<string>>(readHandled);
  const [showHandled, setShowHandled] = useState(false);

  const pending = useMemo(() => {
    return data.pending.filter((row) => {
      if (!showHandled && handled.has(row.personKey)) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (mineOnly && recruiter && !relatedToPartner(row, recruiter)) return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.pending, gameGatekeeper, mineOnly, recruiter, query, handled, showHandled]);

  function markHandled(personKey: string) {
    const next = new Set(handled).add(personKey);
    setHandled(next);
    writeHandled(next);
  }

  return (
    <div className="recruitment-board">
      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>待處理有緣人</h2>
          <button
            type="button"
            className="admin-more-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <span><Filter size={18} /> 篩選</span>
            <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
          </button>
        </div>
        <p className="admin-caption">
          預設只看尚未填寫正式資料
          {recruiter ? ` · 優先與接引人「${recruiter}」相關（遊戲關主另計）` : ""}
        </p>
        <div className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
          <input
            aria-label="搜尋姓名或電話"
            placeholder="搜尋姓名、電話"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="篩選遊戲關主"
            value={gameGatekeeper}
            onChange={(event) => setGameGatekeeper(event.target.value)}
          >
            <option value="">所有遊戲關主</option>
            {data.gameGatekeepers.map((row) => (
              <option key={row.name}>{row.name}</option>
            ))}
          </select>
          {recruiter ? (
            <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly((value) => !value)}>
              {mineOnly ? "只看與我相關" : "顯示全部待填"}
            </button>
          ) : null}
          <button type="button" aria-pressed={showHandled} onClick={() => setShowHandled((value) => !value)}>
            {showHandled ? "含已處理" : "隱藏已處理"}
          </button>
        </div>
        <p className="admin-caption">{pending.length} 位 · 僅工作人員可見</p>
        {!pending.length ? (
          <p className="admin-empty">{data.pending.length ? "沒有符合篩選的待處理同學" : "目前沒有待填正式資料的同學"}</p>
        ) : (
          <div className="admin-person-list recruitment-pending">
            {pending.map((row) => (
              <article key={row.personKey}>
                <div>
                  <strong>{row.name}</strong>
                  <span className="admin-badge">
                    {row.status === "ambiguous" ? "姓名需確認" : handled.has(row.personKey) ? "已處理" : "尚未填寫正式資料"}
                  </span>
                </div>
                <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                <p>{row.phone || "電話未填"}</p>
                <small>遊戲完成 {clock(row.completedAt || row.gameCompletedAt)}</small>
                <p>遊戲關主 {row.gameGatekeeper || "未填"} · 正式招生接引人 {row.recruiters || "尚未指定"}</p>
                <p>
                  活動 {row.activity || "未報"} · 入社 {yesNo(row.joined)} · 保證金 {yesNo(row.depositPaid)}
                </p>
                <small>{waitLabel(row.waitMinutes)}</small>
                <div className="recruitment-actions">
                  <a className="admin-primary" href={followUpHref(row)}>
                    填寫正式資料
                  </a>
                  <a href={row.prefillUrl} target="_blank" rel="noreferrer">
                    開啟表單 <ExternalLink size={16} />
                  </a>
                  <button type="button" onClick={() => markHandled(row.personKey)}>
                    標記已處理
                  </button>
                  <button type="button" onClick={() => setProfile(row)}>
                    查看詳細資料
                  </button>
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

export function RosterList({
  data,
  query,
  setQuery,
  gameGatekeeper,
  setGameGatekeeper,
  recruiter,
  setRecruiter,
  date,
  setDate,
}: {
  data: RecruitmentData;
  query: string;
  setQuery: (value: string) => void;
  gameGatekeeper: string;
  setGameGatekeeper: (value: string) => void;
  recruiter: string;
  setRecruiter: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const [activity, setActivity] = useState("");
  const [joined, setJoined] = useState("");
  const [deposit, setDeposit] = useState("");
  const [filled, setFilled] = useState("");
  const [range, setRange] = useState<"today" | "yesterday" | "date" | "all">("all");
  const taipeiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(
    new Date(Date.now() - 86400000),
  );

  const people = useMemo(() => {
    return data.profiles.filter((row) => {
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (recruiter && !(row.recruiterList || []).includes(recruiter)) return false;
      if (activity && !(row.activity || "").includes(activity) && !(row.events || []).includes(activity)) return false;
      if (joined === "yes" && row.joined !== "是") return false;
      if (joined === "no" && row.joined === "是") return false;
      if (deposit === "yes" && row.depositPaid !== "是") return false;
      if (deposit === "no" && row.depositPaid === "是") return false;
      if (filled === "yes" && row.pending) return false;
      if (filled === "no" && !row.pending) return false;
      if (range !== "all") {
        const day = (row.gameCompletedAt || row.submittedAt || "").slice(0, 10);
        const target = range === "today" ? taipeiToday : range === "yesterday" ? yesterday : date;
        const taipeiDay = row.gameCompletedAt
          ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date(row.gameCompletedAt))
          : day;
        if (taipeiDay !== target) return false;
      }
      return rowMatchesQuery(row, query);
    });
  }, [
    data.profiles,
    gameGatekeeper,
    recruiter,
    activity,
    joined,
    deposit,
    filled,
    range,
    date,
    query,
    taipeiToday,
    yesterday,
  ]);

  return (
    <div className="recruitment-board">
      <section className="admin-panel">
        <div className="admin-section-heading">
          <p className="admin-caption">搜尋、篩選、查看詳細資料</p>
          <button
            type="button"
            className="admin-more-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <span><Filter size={18} /> 篩選</span>
            <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
          </button>
        </div>
        <div className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
          <input
            aria-label="搜尋姓名或電話"
            placeholder="搜尋姓名、電話"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="roster-range" role="group" aria-label="日期範圍">
            <button type="button" aria-pressed={range === "today"} onClick={() => setRange("today")}>今日</button>
            <button type="button" aria-pressed={range === "yesterday"} onClick={() => setRange("yesterday")}>昨日</button>
            <button type="button" aria-pressed={range === "date"} onClick={() => setRange("date")}>指定日期</button>
            <button type="button" aria-pressed={range === "all"} onClick={() => setRange("all")}>歷史全部</button>
          </div>
          {range === "date" ? (
            <label>
              指定日期
              <input aria-label="查詢日期" type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
            </label>
          ) : null}
          <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
            <option value="">所有遊戲關主</option>
            {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選正式招生接引人" value={recruiter} onChange={(event) => setRecruiter(event.target.value)}>
            <option value="">所有正式招生接引人</option>
            {data.recruiters.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選活動" value={activity} onChange={(event) => setActivity(event.target.value)}>
            <option value="">所有活動</option>
            {REAL_EVENTS.map((name) => <option key={name}>{name}</option>)}
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
          <select aria-label="是否已填正式資料" value={filled} onChange={(event) => setFilled(event.target.value)}>
            <option value="">填表不限</option>
            <option value="no">尚未填正式資料</option>
            <option value="yes">已填正式資料</option>
          </select>
        </div>
        {dateScope === "custom" ? (
          <p className="admin-caption">依上方查詢日期 {data.date.replaceAll("-", ".")}</p>
        ) : null}
        <p className="admin-caption">{people.length} 位 · 僅工作人員可見</p>
        {!people.length ? (
          <p className="admin-empty">沒有符合條件的同學</p>
        ) : (
          <div className="admin-person-list">
            {people.map((row) => (
              <article key={row.personKey}>
                <div>
                  <strong>{row.name}</strong>
                  <span className="admin-badge">{row.pending ? "尚未填表" : "已填正式資料"}</span>
                </div>
                <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                <p>{row.phone || "電話未填"}</p>
                <p>遊戲關主 {row.gameGatekeeper || "未填"} · 正式招生接引人 {row.recruiters || "尚未填表"}</p>
                <p>活動 {row.activity || "未報"} · 入社 {yesNo(row.joined)} · 保證金 {yesNo(row.depositPaid)}</p>
                <div className="recruitment-actions">
                  {row.pending ? (
                    <a className="admin-primary" href={followUpHref(row)}>填寫正式資料</a>
                  ) : null}
                  {row.prefillUrl ? (
                    <a href={row.prefillUrl} target="_blank" rel="noreferrer">開啟表單</a>
                  ) : null}
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
      {data.sync.links?.game ? (
        <>
          <dt>遊戲成績表</dt>
          <dd>
            <a className="admin-sheet-link" href={data.sync.links.game} target="_blank" rel="noreferrer">
              打開可寫入的遊戲分頁 <ExternalLink size={16} />
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

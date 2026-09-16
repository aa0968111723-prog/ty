import { Fragment, useLayoutEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Filter } from "lucide-react";
import { profileTouchesTaipeiDate, rosterFilterDate } from "@/lib/club/roster-date.mjs";
import { RecruitmentProfileSheet, type RecruitmentProfile } from "./recruitment-profile-sheet";

export type SyncFlag = { ok: boolean; stale?: boolean; error?: string };
export type RecruitmentData = {
  date: string;
  summary: {
    playedToday: number;
    playedTotal?: number;
    pending: number;
    pendingToday?: number;
    recruited: number;
    recruitedToday?: number;
    activity: number | null;
    activityToday?: number;
    joined: number | null;
    depositPaid: number | null;
    depositNeedsReview?: boolean;
    depositTotal: number | null;
    roster: number;
  };
  activities?: Array<{ name: string; count: number }>;
  daily?: Array<{ date: string; contacts: number; activity: number; joined: number }>;
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

export function PendingQueue({
  data,
  query,
  setQuery,
  gameGatekeeper,
  setGameGatekeeper,
}: {
  data: RecruitmentData;
  query: string;
  setQuery: (value: string) => void;
  gameGatekeeper: string;
  setGameGatekeeper: (value: string) => void;
}) {
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const pending = useMemo(() => {
    return data.pending.filter((row) => {
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.pending, gameGatekeeper, query]);
  const priorityKey = pending[0]?.personKey;

  useLayoutEffect(() => {
    if (!priorityKey || typeof document === "undefined") return;
    if (!window.matchMedia("(max-width: 759px)").matches) return;

    const revealPendingActions = () => {
      const card = document.querySelector(".recruitment-pending article.is-priority");
      const nav = document.querySelector(".admin-bottom-nav");
      if (!(card instanceof HTMLElement)) return;
      if (!(nav instanceof HTMLElement) || getComputedStyle(nav).display === "none") return;
      const actions = [...card.querySelectorAll(".recruitment-actions a, .recruitment-actions button")]
        .filter((el): el is HTMLElement => el instanceof HTMLElement);
      if (!actions.length) return;
      actions[actions.length - 1].scrollIntoView({ block: "end", inline: "nearest" });
      const navTop = nav.getBoundingClientRect().top;
      const lowest = Math.max(...actions.map((el) => el.getBoundingClientRect().bottom));
      const overlap = lowest - navTop;
      if (overlap > 0) window.scrollBy({ top: overlap + 2, left: 0, behavior: "auto" });
    };

    revealPendingActions();
    const frame = window.requestAnimationFrame(revealPendingActions);
    return () => window.cancelAnimationFrame(frame);
  }, [priorityKey]);

  return (
    <div className="recruitment-board">
      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>待填正式資料</h2>
          <a className="admin-primary" href="/follow-up">接引人快速填表</a>
        </div>
        <p className="admin-caption">
          {pending.length} 位尚未填正式招生資料 · 遊戲關主不會自動變成接引人
        </p>
        <div className="admin-filters recruitment-filters is-open">
          <input
            aria-label="搜尋姓名、電話、科系"
            placeholder="搜尋姓名、電話、科系"
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
        </div>
        {!pending.length ? (
          <p className="admin-empty">這時段沒有待填的同學</p>
        ) : (
          <div className="admin-person-list recruitment-pending">
            {pending.map((row, index) => (
              <article
                key={row.personKey}
                data-review={row.needsReview ? "true" : undefined}
                className={index === 0 ? "is-priority" : undefined}
              >
                <div>
                  <strong>{row.name}</strong>
                  {index === 0 ? <span className="admin-badge is-priority">現在先找</span> : null}
                  {row.needsReview ? <span className="admin-badge is-review">需確認</span> : null}
                  <span className="admin-badge">{row.gameGatekeeper || "未分類"}</span>
                </div>
                <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                <p>{row.phone || "電話未填"}</p>
                <small>{waitLabel(row.waitMinutes)} · 遊戲關主 {row.gameGatekeeper || "未填"}</small>
                {row.needsReview ? <p className="admin-caption">姓名或電話有重複，請先對過再送出。</p> : null}
                <div className="recruitment-actions">
                  <a
                    className="admin-primary"
                    data-pending-action="quickfill"
                    href={`/follow-up?personKey=${encodeURIComponent(row.personKey)}${row.submissionId ? `&submissionId=${encodeURIComponent(row.submissionId)}` : ""}`}
                  >
                    <span>接引人快速填表</span>
                  </a>
                  <a data-pending-action="form" href={row.prefillUrl} target="_blank" rel="noreferrer">
                    <span>打開正式表單</span>
                    <ExternalLink size={16} aria-hidden="true" />
                  </a>
                  <button type="button" onClick={() => setProfile(row)}>
                    <span>時間線</span>
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
  status,
  setStatus,
}: {
  data: RecruitmentData;
  query: string;
  setQuery: (value: string) => void;
  gameGatekeeper: string;
  setGameGatekeeper: (value: string) => void;
  recruiter: string;
  setRecruiter: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const [dateScope, setDateScope] = useState<"all" | "today" | "yesterday" | "custom">("all");
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState("");
  const [activity, setActivity] = useState("");
  const [joined, setJoined] = useState("");
  const [deposit, setDeposit] = useState("");
  const dateTarget = rosterFilterDate(dateScope, data.date);
  const departments = useMemo(
    () => [...new Set(data.profiles.map((row) => row.department).filter(Boolean))],
    [data.profiles],
  );
  const grades = useMemo(
    () => [...new Set(data.profiles.map((row) => row.grade).filter(Boolean))],
    [data.profiles],
  );
  const activities = useMemo(
    () => [...new Set((data.activities || []).map((row) => row.name))],
    [data.activities],
  );
  const people = useMemo(() => {
    return data.profiles.filter((row) => {
      if (dateTarget && !profileTouchesTaipeiDate(row, dateTarget)) return false;
      if (status === "pending" && !row.pending) return false;
      if (status === "done" && row.pending) return false;
      if (status === "review" && !row.needsReview) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (recruiter && !(row.recruiterList || []).includes(recruiter)) return false;
      if (department && row.department !== department) return false;
      if (grade && row.grade !== grade) return false;
      if (activity && !(row.activity || "").includes(activity)) return false;
      if (joined === "yes" && row.joined !== "是") return false;
      if (joined === "no" && row.joined === "是") return false;
      if (deposit === "yes" && row.depositPaid !== "是") return false;
      if (deposit === "no" && row.depositPaid === "是") return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.profiles, dateTarget, status, gameGatekeeper, recruiter, department, grade, activity, joined, deposit, query]);

  return (
    <div className="recruitment-board">
      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>同學</h2>
          <button type="button" className="admin-more-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
            <span><Filter size={18} /> 篩選</span>
            <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
          </button>
        </div>
        <div className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
          <input aria-label="搜尋姓名或電話" placeholder="搜尋姓名、電話、科系" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="篩選日期" value={dateScope} onChange={(event) => setDateScope(event.target.value as typeof dateScope)}>
            <option value="all">歷史全部</option>
            <option value="today">今日</option>
            <option value="yesterday">昨日</option>
            <option value="custom">指定日期</option>
          </select>
          <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
            <option value="">所有遊戲關主</option>
            {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選這位有緣人的接引人" value={recruiter} onChange={(event) => setRecruiter(event.target.value)}>
            <option value="">所有接引人</option>
            {data.recruiters.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="待追蹤或已完成" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部狀態</option>
            <option value="pending">待填正式資料</option>
            <option value="done">已填正式資料</option>
            <option value="review">需確認</option>
          </select>
          <select aria-label="篩選科系" value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">所有科系</option>
            {departments.map((name) => <option key={name}>{name}</option>)}
          </select>
          <select aria-label="篩選年級" value={grade} onChange={(event) => setGrade(event.target.value)}>
            <option value="">所有年級</option>
            {grades.map((name) => <option key={name}>{name}</option>)}
          </select>
          <select aria-label="篩選活動" value={activity} onChange={(event) => setActivity(event.target.value)}>
            <option value="">所有活動</option>
            {activities.map((name) => <option key={name}>{name}</option>)}
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
        </div>
        {dateScope === "custom" ? (
          <p className="admin-caption">依上方查詢日期 {data.date.replaceAll("-", ".")}</p>
        ) : null}
        <p className="admin-caption">{people.length} 位 · 僅工作人員可見</p>
        {!people.length ? (
          <p className="admin-empty" data-empty="roster">
            {data.profiles.length === 0 ? "目前還沒有名單" : "沒有符合條件的同學"}
          </p>
        ) : (
          <div className="admin-person-list is-always">
            {people.map((row) => (
              <article
                key={row.personKey}
                data-review={row.needsReview ? "true" : undefined}
                role="button"
                tabIndex={0}
                onClick={() => setProfile(row)}
                onKeyDown={(event) => event.key === "Enter" && setProfile(row)}
              >
                <div>
                  <strong>{row.name}</strong>
                  {row.needsReview ? <span className="admin-badge is-review">需確認</span> : null}
                  <span className="admin-badge">{row.pending ? "待填正式資料" : row.activity || "已填表"}</span>
                </div>
                <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                <p>遊戲關主 {row.gameGatekeeper || "未填"} · 這位有緣人的接引人 {row.recruiters || "尚未填表"}</p>
                <small>{row.phone || "電話未填"}</small>
                {row.needsReview ? <p className="admin-caption">姓名或電話有重複，分開列出請先對過。</p> : null}
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

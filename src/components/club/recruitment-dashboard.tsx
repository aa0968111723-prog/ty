import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Filter } from "lucide-react";
import { BattleCommand } from "./battle-kpis";
import { RecruitmentProfileSheet, type RecruitmentProfile } from "./recruitment-profile-sheet";
import { OFFICIAL_RECRUITERS, RECRUITER_STORAGE_KEY, taipeiDate } from "@/lib/club/recruitment-prefill.mjs";
import { filterPendingQueue } from "@/lib/club/recruitment-queue.mjs";
import { time } from "./admin-presentation";

export type SyncFlag = { ok: boolean; stale?: boolean; error?: string };
export type RecruitmentData = {
  date: string;
  summary: {
    contactsToday?: number;
    contactsTotal?: number;
    playedToday: number;
    pending: number;
    pendingFormal?: number;
    pendingToday?: number;
    recruited: number;
    recruitedToday?: number;
    activity: number | null;
    activityToday?: number | null;
    joined: number | null;
    depositPaid: number | null;
    depositTotal: number | null;
    roster: number;
  };
  activities?: Array<{ name: string; count: number; today: number }>;
  dailyTrend?: Array<{ date: string; contacts: number; activity: number; joined: number }>;
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
    prefillUrl: string;
    gameGatekeeper: string;
    completedAt?: string;
    followUpPath?: string;
    needsConfirmation?: boolean;
    confirmationReason?: string;
    submissionId?: string;
  }>;
  profiles: RecruitmentProfile[];
  gameGatekeepers: Array<{
    name: string;
    played: number;
    pending: number;
    recruited: number;
    activity: number | null;
    joined: number | null;
    depositPaid?: number | null;
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

const HANDLED_KEY = "admin-handled-people";

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

function readRecruiter() {
  try {
    return localStorage.getItem(RECRUITER_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function rowMatchesQuery(
  row: { name?: string; phone?: string; department?: string; grade?: string },
  query: string,
) {
  const needle = query.trim();
  if (!needle) return true;
  return `${row.name} ${row.phone} ${row.department} ${row.grade}`.includes(needle);
}

function statusLabel(row: RecruitmentProfile) {
  if (row.pending) return "尚未填正式資料";
  if (row.joined === "是" && row.depositPaid === "是") return "已入社已繳費";
  if (row.joined === "是") return "已入社";
  if ((row.activityList || []).length || row.activity) return "已報名活動";
  return "已填正式資料";
}

function RecruiterPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (name: string) => void;
  compact?: boolean;
}) {
  const [choosing, setChoosing] = useState(!value);
  const showGrid = !compact || !value || choosing;
  function pick(name: string) {
    const next = value === name ? "" : name;
    onChange(next);
    setChoosing(!next);
  }
  const buttons = (
    <div className="quickfill-partners">
      {OFFICIAL_RECRUITERS.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={value === name}
          onClick={() => pick(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
  if (compact && value && !showGrid) {
    return (
      <div className="battle-next-picker is-selected">
        <p className="admin-caption">這位有緣人的接引人</p>
        <div className="battle-next-self">
          <strong>{value}</strong>
          <button type="button" onClick={() => setChoosing(true)}>更換</button>
        </div>
      </div>
    );
  }
  if (compact) {
    return (
      <div className="battle-next-picker">
        <p className="admin-caption">這位有緣人的接引人</p>
        {buttons}
      </div>
    );
  }
  return (
    <section className="admin-panel" aria-label="這位有緣人的接引人">
      <h2>這位有緣人的接引人</h2>
      <p className="admin-caption">選擇目前負責後續聯繫的夥伴。遊戲關主不會被改成接引人。</p>
      {buttons}
    </section>
  );
}

function NextUpCard({
  row,
  featured,
}: {
  row: RecruitmentProfile & { waitMinutes?: number | null; followUpPath?: string };
  featured?: boolean;
}) {
  const followUp = row.followUpPath || `/follow-up?personKey=${encodeURIComponent(row.personKey)}`;
  return (
    <article className={`battle-next-card${featured ? " is-next" : ""}`}>
      {featured ? <small>下一位</small> : null}
      <strong>{row.name}</strong>
      <p>{row.department || "科系未填"}{row.grade ? ` · ${row.grade}` : ""}</p>
      <p className="admin-badge">{statusLabel(row)}</p>
      <a className="admin-primary" href={followUp}>填寫正式資料</a>
    </article>
  );
}

function PersonCard({
  row,
  onOpen,
  onHandled,
  handled,
}: {
  row: RecruitmentProfile & {
    waitMinutes?: number | null;
    prefillUrl?: string;
    completedAt?: string;
    followUpPath?: string;
    needsConfirmation?: boolean;
    confirmationReason?: string;
  };
  onOpen: () => void;
  onHandled?: () => void;
  handled?: boolean;
}) {
  const followUp = row.followUpPath || `/follow-up?personKey=${encodeURIComponent(row.personKey)}`;
  const activities = row.activityList?.length ? row.activityList.join("、") : (row.activity || "尚未報名");
  return (
    <article className="recruitment-card">
      <div>
        <strong>{row.name}</strong>
        <span className="admin-badge">{statusLabel(row)}</span>
      </div>
      {row.needsConfirmation ? (
        <p className="admin-error" role="status">{row.confirmationReason || "姓名或電話重複，需要確認"}</p>
      ) : null}
      <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
      <p>{row.phone || "電話未填"}</p>
      <p>遊戲完成 {row.gameCompletedAt || row.completedAt ? time(String(row.gameCompletedAt || row.completedAt)) : "時間未填"}</p>
      <p>遊戲關主 {row.gameGatekeeper || "未填"}</p>
      <p>正式接引人 {row.recruiters || "尚未指定"}</p>
      <p>活動 {activities}</p>
      <p>入社 {row.joined || "尚未填"} · 保證金 {row.depositPaid || "尚未填"}</p>
      <div className="recruitment-actions">
        <a className="admin-primary" href={followUp}>填寫正式資料</a>
        {row.prefillUrl ? (
          <a href={row.prefillUrl} target="_blank" rel="noreferrer">
            開啟表單 <ExternalLink size={16} />
          </a>
        ) : null}
        {onHandled ? (
          <button type="button" onClick={onHandled}>
            {handled ? "取消已處理" : "標記已處理"}
          </button>
        ) : null}
        <button type="button" onClick={onOpen}>查看詳細</button>
      </div>
    </article>
  );
}

export function RecruitmentDashboard({
  data,
  mode = "command",
  query,
  setQuery,
  gameGatekeeper,
  setGameGatekeeper,
  recruiter,
  setRecruiter,
  status,
  setStatus,
  date,
  setDate,
  onOpenQueue,
  onOpenRoster,
}: {
  data: RecruitmentData;
  mode?: "command" | "queue" | "roster";
  query: string;
  setQuery: (value: string) => void;
  gameGatekeeper: string;
  setGameGatekeeper: (value: string) => void;
  recruiter: string;
  setRecruiter: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  date?: string;
  setDate?: (value: string) => void;
  onOpenQueue?: () => void;
  onOpenRoster?: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const [activity, setActivity] = useState("");
  const [joined, setJoined] = useState("");
  const [deposit, setDeposit] = useState("");
  const [filled, setFilled] = useState("");
  const [range, setRange] = useState<"today" | "yesterday" | "date" | "all">("all");
  const [handled, setHandled] = useState<Set<string>>(readHandled);
  const [selfRecruiter, setSelfRecruiter] = useState(() => recruiter || readRecruiter());
  const [showAllPending, setShowAllPending] = useState(false);
  const activities = data.activities?.length
    ? data.activities.map((row) => row.name)
    : [...new Set(data.profiles.flatMap((row) => row.activityList || []).filter(Boolean))];

  const relatedPending = useMemo(() => {
    return filterPendingQueue(data.pending, {
      self: selfRecruiter,
      showAll: false,
      handled,
      includeHandled: false,
    });
  }, [data.pending, selfRecruiter, handled]);

  const pending = useMemo(() => {
    return filterPendingQueue(data.pending, {
      self: selfRecruiter,
      showAll: showAllPending,
      handled,
      includeHandled: status === "handled",
      gameGatekeeper,
      query,
    });
  }, [data.pending, gameGatekeeper, selfRecruiter, query, handled, status, showAllPending]);

  const people = useMemo(() => {
    const today = data.date;
    const yesterday = taipeiDate(new Date(`${data.date}T12:00:00+08:00`))
      ? (() => {
        const noon = new Date(`${data.date}T12:00:00+08:00`);
        return taipeiDate(new Date(noon.getTime() - 86400000));
      })()
      : "";
    return data.profiles.filter((row) => {
      const completed = row.gameCompletedAt || row.submittedAt || "";
      const day = completed ? taipeiDate(completed) : "";
      if (range === "today" && day && day !== today) return false;
      if (range === "yesterday" && day && day !== yesterday) return false;
      if (range === "date" && date && day && day !== date) return false;
      if (status === "pending" && !row.pending) return false;
      if (status === "done" && row.pending) return false;
      if (filled === "yes" && row.pending) return false;
      if (filled === "no" && !row.pending) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (recruiter && !(row.recruiterList || []).includes(recruiter)) return false;
      if (activity && !(row.activityList || []).includes(activity) && row.activity !== activity) return false;
      if (joined === "yes" && row.joined !== "是") return false;
      if (joined === "no" && row.joined === "是") return false;
      if (deposit === "yes" && row.depositPaid !== "是") return false;
      if (deposit === "no" && row.depositPaid === "是") return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.profiles, data.date, range, date, status, filled, gameGatekeeper, recruiter, activity, joined, deposit, query]);

  function rememberRecruiter(name: string) {
    setSelfRecruiter(name);
    setRecruiter(name);
    setShowAllPending(false);
    try { localStorage.setItem(RECRUITER_STORAGE_KEY, name); } catch { /* ignore */ }
  }

  function toggleHandled(personKey: string) {
    setHandled((current) => {
      const next = new Set(current);
      if (next.has(personKey)) next.delete(personKey);
      else next.add(personKey);
      writeHandled(next);
      return next;
    });
  }

  if (mode === "command") {
    const nextUp = relatedPending.slice(0, 3);
    return (
      <div className="recruitment-board">
        <section className="admin-panel battle-next" aria-label="現在該處理">
          <div className="admin-section-heading">
            <h2>現在該處理</h2>
            <button type="button" onClick={() => onOpenQueue?.()}>待處理名單</button>
          </div>
          <RecruiterPicker value={selfRecruiter} onChange={rememberRecruiter} compact />
          {!selfRecruiter ? (
            <p className="admin-empty" role="status">
              先選「這位有緣人的接引人」，這裡會出現你現在該找的同學。
            </p>
          ) : !nextUp.length ? (
            <p className="admin-empty" role="status">
              目前沒有與「{selfRecruiter}」相關、尚未填正式資料的同學。遊戲關主不會自動變成正式接引人。
            </p>
          ) : (
            <div className="battle-next-list">
              {nextUp.map((row, index) => (
                <NextUpCard key={row.personKey} row={row} featured={index === 0} />
              ))}
            </div>
          )}
        </section>
        <BattleCommand
          data={{
            summary: data.summary,
            activities: data.activities || [],
            dailyTrend: data.dailyTrend || [],
            funnel: data.funnel,
            sync: data.sync,
          }}
          onOpenQueue={() => onOpenQueue?.()}
          onOpenRoster={() => onOpenRoster?.()}
        />
        <RecruitmentProfileSheet profile={profile} onClose={() => setProfile(null)} />
      </div>
    );
  }

  if (mode === "queue") {
    return (
      <div className="recruitment-board">
        <RecruiterPicker value={selfRecruiter} onChange={rememberRecruiter} />
        <section className="admin-panel">
          <div className="admin-section-heading">
            <h2>待填正式招生資料</h2>
            <button type="button" className="admin-more-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
              <span><Filter size={18} /> 篩選</span>
              <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
            </button>
          </div>
          <p className="admin-caption">
            {showAllPending || !selfRecruiter
              ? `${pending.length} 位尚未填正式資料`
              : `${pending.length} 位與「${selfRecruiter}」相關、尚未填正式資料`}
          </p>
          <button
            type="button"
            aria-pressed={showAllPending}
            data-queue="show-all"
            onClick={() => setShowAllPending((value) => !value)}
          >
            {showAllPending ? "只看我的有緣人" : "看全部尚未填表"}
          </button>
          <button type="button" onClick={() => setStatus(status === "handled" ? "pending" : "handled")}>
            {status === "handled" ? "只看未處理" : "含已標記處理"}
          </button>
          <div className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
            <input aria-label="搜尋姓名或電話" placeholder="搜尋姓名、電話" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
              <option value="">所有遊戲關主</option>
              {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
            </select>
          </div>
          {!pending.length ? (
            <div className="admin-empty" role="status">
              {!selfRecruiter && !showAllPending ? (
                <p>先選「這位有緣人的接引人」。預設只顯示與你相關、尚未填正式資料或尚未完成追蹤的同學。</p>
              ) : selfRecruiter && !showAllPending ? (
                <p>
                  目前沒有與「{selfRecruiter}」相關、尚未填正式資料的同學。遊戲關主不會自動變成正式接引人。若要協助其他有緣人，請點「看全部尚未填表」。
                </p>
              ) : (
                <p>這時段沒有待處理同學</p>
              )}
            </div>
          ) : (
            <div className="admin-person-list">
              {pending.map((row) => (
                <PersonCard
                  key={row.personKey}
                  row={row}
                  onOpen={() => setProfile(row)}
                  onHandled={() => toggleHandled(row.personKey)}
                  handled={handled.has(row.personKey)}
                />
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
          <h2>招生名單</h2>
          <button type="button" className="admin-more-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
            <span><Filter size={18} /> 篩選</span>
            <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
          </button>
        </div>
        <div className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
          <input aria-label="搜尋姓名或電話" placeholder="搜尋姓名、電話" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="日期範圍" value={range} onChange={(event) => setRange(event.target.value as typeof range)}>
            <option value="today">今日</option>
            <option value="yesterday">昨日</option>
            <option value="date">指定日期</option>
            <option value="all">歷史全部</option>
          </select>
          {range === "date" && setDate ? (
            <input aria-label="指定日期" type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
          ) : null}
          <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
            <option value="">所有遊戲關主</option>
            {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選正式接引人" value={recruiter} onChange={(event) => setRecruiter(event.target.value)}>
            <option value="">所有接引人</option>
            {data.recruiters.map((row) => <option key={row.name}>{row.name}</option>)}
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
          <select aria-label="是否已填正式資料" value={filled} onChange={(event) => setFilled(event.target.value)}>
            <option value="">填表不限</option>
            <option value="no">尚未填正式資料</option>
            <option value="yes">已填正式資料</option>
          </select>
        </div>
        <p className="admin-caption">{people.length} 位 · 僅工作人員可見</p>
        {!people.length ? (
          <p className="admin-empty">沒有符合條件的同學</p>
        ) : (
          <div className="admin-person-list">
            {people.map((row) => (
              <PersonCard
                key={row.personKey}
                row={row}
                onOpen={() => setProfile(row)}
              />
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
          <dd>{flag.ok ? "● 正常" : flag.stale ? "○ 同步失敗 · 顯示上次資料" : "○ 同步失敗"}</dd>
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

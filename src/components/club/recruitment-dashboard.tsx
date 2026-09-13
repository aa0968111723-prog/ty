import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Filter } from "lucide-react";
import { RecruitmentProfileSheet, type RecruitmentProfile } from "./recruitment-profile-sheet";

export type SyncFlag = { ok: boolean; stale?: boolean; error?: string };
export type RecruitmentData = {
  date: string;
  summary: {
    playedToday: number;
    pending: number;
    pendingToday?: number;
    recruited: number;
    recruitedToday?: number;
    s: number | null;
    a: number | null;
    b: number | null;
    activity: number | null;
    joined: number | null;
    depositPaid: number | null;
    depositTotal: number | null;
    roster: number;
  };
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
  }>;
  profiles: RecruitmentProfile[];
  gameGatekeepers: Array<{
    name: string;
    played: number;
    pending: number;
    recruited: number;
    s: number | null;
    a: number | null;
    b: number | null;
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
  };
};

function metric(value: number | null | undefined) {
  if (value == null) return "資料不足";
  return value.toLocaleString();
}

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

export function RecruitmentDashboard({
  data,
  query,
  setQuery,
  gameGatekeeper,
  setGameGatekeeper,
  recruiter,
  setRecruiter,
  tier,
  setTier,
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
  tier: string;
  setTier: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profile, setProfile] = useState<RecruitmentProfile | null>(null);
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState("");
  const [activity, setActivity] = useState("");
  const [joined, setJoined] = useState("");
  const [deposit, setDeposit] = useState("");
  const departments = useMemo(
    () => [...new Set(data.profiles.map((row) => row.department).filter(Boolean))],
    [data.profiles],
  );
  const grades = useMemo(
    () => [...new Set(data.profiles.map((row) => row.grade).filter(Boolean))],
    [data.profiles],
  );
  const activities = useMemo(
    () => [...new Set(data.profiles.map((row) => row.activity).filter(Boolean))],
    [data.profiles],
  );
  const pending = useMemo(() => {
    return data.pending.filter((row) => {
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (department && row.department !== department) return false;
      if (grade && row.grade !== grade) return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.pending, gameGatekeeper, department, grade, query]);
  const people = useMemo(() => {
    return data.profiles.filter((row) => {
      if (status === "pending" && !row.pending) return false;
      if (status === "done" && row.pending) return false;
      if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
      if (recruiter && !(row.recruiterList || []).includes(recruiter)) return false;
      if (tier && !(row.tier || "").startsWith(tier)) return false;
      if (department && row.department !== department) return false;
      if (grade && row.grade !== grade) return false;
      if (activity && row.activity !== activity) return false;
      if (joined === "yes" && row.joined !== "是") return false;
      if (joined === "no" && row.joined === "是") return false;
      if (deposit === "yes" && row.depositPaid !== "是") return false;
      if (deposit === "no" && row.depositPaid === "是") return false;
      return rowMatchesQuery(row, query);
    });
  }, [data.profiles, status, gameGatekeeper, recruiter, tier, department, grade, activity, joined, deposit, query]);

  return (
    <div className="recruitment-board">
      <section className="admin-summary" aria-label="招生摘要">
        <div className="admin-widget-kpi"><span>今天遊戲</span><strong>{metric(data.summary.playedToday)}</strong><small>現場挑戰人數</small></div>
        <div className="admin-widget-kpi"><span>尚未填表</span><strong>{metric(data.summary.pending)}</strong><small>待追蹤</small></div>
        <div className="admin-widget-kpi"><span>已完成招生</span><strong>{metric(data.summary.recruited)}</strong><small>有效紀錄</small></div>
        <div className="admin-widget-kpi"><span>S</span><strong>{metric(data.summary.s)}</strong><small>分級</small></div>
        <div className="admin-widget-kpi"><span>A</span><strong>{metric(data.summary.a)}</strong><small>分級</small></div>
        <div className="admin-widget-kpi"><span>B</span><strong>{metric(data.summary.b)}</strong><small>分級</small></div>
        <div className="admin-widget-kpi"><span>已報活動</span><strong>{metric(data.summary.activity)}</strong><small>總表</small></div>
        <div className="admin-widget-kpi"><span>已入社</span><strong>{metric(data.summary.joined)}</strong><small>總表</small></div>
        <div className="admin-widget-kpi"><span>保證金已繳</span><strong>{metric(data.summary.depositPaid)}</strong><small>總額 {metric(data.summary.depositTotal)}</small></div>
        <div className="admin-widget-kpi"><span>總留資料</span><strong>{metric(data.summary.roster)}</strong><small>總表人數</small></div>
      </section>

      <section className="admin-panel recruitment-funnel" aria-label="招生漏斗">
        <h2>招生狀況</h2>
        <ol>
          {data.funnel.map((layer) => (
            <li key={layer.id}>
              <strong>{layer.label}</strong>
              <b>{layer.missing || layer.count == null ? "資料不足" : layer.count}</b>
              <small>
                {layer.fromPrevious == null ? (layer.id === "played" ? "起點" : "資料不足") : `上一階 ${layer.fromPrevious}%`}
                {layer.fromStart != null ? ` · 整體 ${layer.fromStart}%` : ""}
              </small>
            </li>
          ))}
        </ol>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>待追蹤</h2>
          <a className="admin-primary" href="/follow-up">接引人快速填表</a>
        </div>
        <p className="admin-caption">{pending.length} 位尚未填招生表單 · 遊戲關主與接引人分開填</p>
        {!pending.length ? (
          <p className="admin-empty">這時段沒有待追蹤同學</p>
        ) : (
          <div className="admin-person-list recruitment-pending">
            {pending.map((row) => (
              <article key={row.personKey}>
                <div>
                  <strong>{row.name}</strong>
                  <span className="admin-badge">{row.gameGatekeeper || "未分類"}</span>
                </div>
                <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                <p>{row.phone || "電話未填"}</p>
                <small>{waitLabel(row.waitMinutes)} · {row.score?.toLocaleString?.() ?? row.score} 分</small>
                <div className="recruitment-actions">
                  <a
                    className="admin-primary"
                    href={`/follow-up?personKey=${encodeURIComponent(row.personKey)}${row.submissionId ? `&submissionId=${encodeURIComponent(row.submissionId)}` : ""}`}
                  >
                    接引人快速填表
                  </a>
                  <a href={row.prefillUrl} target="_blank" rel="noreferrer">
                    直接開表單 <ExternalLink size={16} />
                  </a>
                  <button type="button" onClick={() => setProfile(row)}>時間線</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <h2>關主狀況</h2>
        <p className="admin-caption">接引進度 · 遊戲關主與招生接引人不一定相同</p>
        <div className="recruitment-gatekeepers">
          {data.gameGatekeepers.map((row) => (
            <button key={row.name} type="button" onClick={() => setGameGatekeeper(row.name === gameGatekeeper ? "" : row.name)}>
              <strong>{row.name}</strong>
              <span>玩遊戲 {row.played}</span>
              <span>待追蹤 {row.pending}</span>
              <span>已填表 {row.recruited}</span>
              <span>S {metric(row.s)} · A {metric(row.a)} · B {metric(row.b)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>同學名單</h2>
          <button type="button" className="admin-more-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
            <span><Filter size={18} /> 篩選</span>
            <ChevronDown size={18} className={filtersOpen ? "is-open" : ""} />
          </button>
        </div>
        <div className={`admin-filters recruitment-filters${filtersOpen ? " is-open" : ""}`}>
          <input aria-label="搜尋姓名或電話" placeholder="搜尋姓名、電話、科系" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="篩選遊戲關主" value={gameGatekeeper} onChange={(event) => setGameGatekeeper(event.target.value)}>
            <option value="">所有遊戲關主</option>
            {data.gameGatekeepers.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選招生接引人" value={recruiter} onChange={(event) => setRecruiter(event.target.value)}>
            <option value="">所有接引人</option>
            {data.recruiters.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="篩選分級" value={tier} onChange={(event) => setTier(event.target.value)}>
            <option value="">所有分級</option>
            <option value="S">S</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <select aria-label="待追蹤或已完成" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部狀態</option>
            <option value="pending">待追蹤</option>
            <option value="done">已完成</option>
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
        <p className="admin-caption">{people.length} 位 · 僅工作人員可見</p>
        <div className="admin-person-list">
          {people.map((row) => (
            <article key={row.personKey} role="button" tabIndex={0} onClick={() => setProfile(row)} onKeyDown={(event) => event.key === "Enter" && setProfile(row)}>
              <div>
                <strong>{row.name}</strong>
                <span className="admin-badge">{row.pending ? "待追蹤" : row.tier || "已填表"}</span>
              </div>
              <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
              <p>遊戲關主 {row.gameGatekeeper || "未填"} · 接引人 {row.recruiters || "尚未填表"}</p>
              <small>{row.phone || "電話未填"}</small>
            </article>
          ))}
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>科系／年級</th>
                <th>遊戲關主</th>
                <th>招生接引人</th>
                <th>分級</th>
                <th>活動</th>
                <th>入社</th>
                <th>保證金</th>
                <th>電話</th>
              </tr>
            </thead>
            <tbody>
              {people.map((row) => (
                <tr key={`table-${row.personKey}`}>
                  <td><button type="button" className="recruitment-name" onClick={() => setProfile(row)}>{row.name}</button></td>
                  <td>{row.department}<small>{row.grade}</small></td>
                  <td>{row.gameGatekeeper}</td>
                  <td>{row.recruiters}</td>
                  <td>{row.tier}</td>
                  <td>{row.activity}</td>
                  <td>{row.joined}</td>
                  <td>{row.depositPaid}{row.depositAmount ? ` ${row.depositAmount}` : ""}</td>
                  <td>{row.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </dl>
  );
}

function syncClock(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString("zh-TW", { hour12: false, timeZone: "Asia/Taipei" });
}

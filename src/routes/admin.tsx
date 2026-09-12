import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Users, Trophy, Flag, Settings, RefreshCw, LogOut, Medal } from "lucide-react";
import { AdminLogin } from "@/components/admin-login";
import "@/admin.css";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "社博戰情｜淡江大學禪學社" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminDashboard,
});

type Contact = {
  name: string; phone: string; department: string; grade: string;
  gatekeeper: string; source: string; completedAt: string;
};
type Result = Contact & { submissionId: string; score: number; accuracy: number; correct: number; maxCombo: number };
type Count = { name: string; count: number };
type Dashboard = {
  date: string; contacts: Contact[]; results: Result[]; topThree: Result[];
  kpis: { contacts: number; rawRecords: number; duplicates: number; officialChallenges: number; averageScore: number; highestScore: number; formResponses: number };
  gatekeepers: Count[]; departments: Count[]; grades: Count[];
  trend: { hour: string; count: number }[];
  sync: { forms: { ok: boolean; error?: string }; results: { ok: boolean; error?: string }; updatedAt: string };
};
const tabs = [
  { id: "overview", label: "總覽", icon: BarChart3 },
  { id: "contacts", label: "名單", icon: Users },
  { id: "results", label: "成績", icon: Trophy },
  { id: "leaders", label: "關主", icon: Flag },
  { id: "system", label: "系統", icon: Settings },
] as const;
type Tab = typeof tabs[number]["id"] | "podium";
function taipeiDate(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400000));
}
function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}
function Bars({ rows, onSelect }: { rows: Count[]; onSelect?: (name: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className="admin-empty">這一天還沒有資料</p>;
  return <div className="admin-bars">{rows.map((row) => (
    <button key={row.name} type="button" disabled={!onSelect} onClick={() => onSelect?.(row.name)}>
      <span>{row.name}</span><span className="admin-bar-track"><i style={{ width: `${row.count / max * 100}%` }} /></span><strong>{row.count}</strong>
    </button>
  ))}</div>;
}
function Podium({ rows }: { rows: Result[] }) {
  return <section className="admin-panel"><h2><Medal size={20} /> 今日前三名</h2>
    <p className="admin-caption">僅正式挑戰 · 指定日期 · 排名不公開</p>
    {!rows.length ? <p className="admin-empty">尚無正式挑戰紀錄</p> : <ol className="admin-podium">{rows.map((row, index) => (
      <li key={row.submissionId}><span className={`admin-medal medal-${index}`}>{index + 1}</span>
        <div><strong>{row.name}</strong><small>正確率 {row.accuracy}% · 關主 {row.gatekeeper || "未填"}</small></div><b>{row.score.toLocaleString()}</b></li>
    ))}</ol>}
  </section>;
}
function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [date, setDate] = useState(taipeiDate);
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [leader, setLeader] = useState("");
  const [source, setSource] = useState("");
  const [department, setDepartment] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/session", { signal: controller.signal }).then((response) => response.json())
      .then((body) => setAuthenticated(body.authenticated === true))
      .catch(() => { if (!controller.signal.aborted) setAuthenticated(false); });
    return () => controller.abort();
  }, []);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/dashboard?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (id !== generation.current) return;
      if (response.status === 401) { setAuthenticated(false); setData(null); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "同步失敗");
      if (id === generation.current) { setData(body); setError(""); }
    } catch (cause) {
      if (id === generation.current) setError(cause instanceof Error ? cause.message : "同步失敗，請重新整理");
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }, [date]);
  useEffect(() => {
    if (!authenticated) return;
    setData(null);
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => { clearInterval(timer); generation.current++; };
  }, [authenticated, refresh]);
  async function logout() {
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("登出失敗，請再試一次");
      generation.current++;
      setAuthenticated(false);
      setData(null);
    } catch { setError("登出失敗，請再試一次"); }
  }
  if (authenticated === null) return <main className="admin-page"><p role="status">正在確認登入狀態…</p></main>;
  if (!authenticated) return <main className="admin-page admin-auth"><AdminLogin onSuccess={() => setAuthenticated(true)} /></main>;
  const rows = (tab === "results" ? data?.results : data?.contacts) ?? [];
  const filtered = rows.filter((row) =>
    (!leader || row.gatekeeper === leader) && (!source || row.source === source) &&
    (!department || row.department === department) &&
    (!query || `${row.name} ${row.phone} ${row.department}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  function selectLeader(name: string) { setLeader(name); setTab("contacts"); }
  return (
    <main className="admin-page">
      <aside className="admin-nav">
        <a className="admin-brand" href="/"><img src="/club-mark.svg" alt="" /><span>淡江大學禪學社<small>Focus Challenge</small></span></a>
        <nav aria-label="後台導覽">{tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
        <button className="admin-logout" onClick={logout}><LogOut size={18} />登出</button>
      </aside>
      <div className="admin-content">
        <header className="admin-heading"><div><span className="admin-eyebrow">淡江大學禪學社 · 工作人員專用</span><h1>社博即時戰情</h1><p>{date.replaceAll("-", " / ")}</p></div>
          <button className="admin-refresh" disabled={busy} onClick={() => void refresh()} aria-label="更新資料"><RefreshCw size={20} className={busy ? "admin-spinning" : ""} /><span>更新</span></button>
        </header>
        <div className="admin-date-controls">
          <button aria-pressed={date === taipeiDate()} onClick={() => setDate(taipeiDate())}>今天</button>
          <button aria-pressed={date === taipeiDate(-1)} onClick={() => setDate(taipeiDate(-1))}>昨天</button>
          <label>自訂日期<input aria-label="查詢日期" type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
        </div>
        <div className="admin-sync-line" role="status">
          <span>{data ? (data.sync.forms.ok && data.sync.results.ok && !error ? "● 已連線" : "○ 同步異常 · 部分資料可能缺漏") : busy ? "同步中…" : "尚未同步"}</span>
          <span>最後同步 {data ? time(data.sync.updatedAt) : "—"}</span>
        </div>
        {error && <p className="admin-error" role="alert">{error} · 保留上次成功資料</p>}
        {data && (tab === "overview" || tab === "podium") && <>
          {tab === "overview" && <section className="admin-kpis" aria-label="指定日期統計">
            {[["今日接觸", data.kpis.contacts, "去重複姓名"], ["今日正式挑戰", data.kpis.officialChallenges, "正式完成紀錄"], ["平均分數", data.kpis.averageScore, "正式挑戰"], ["最高分", data.kpis.highestScore, "正式挑戰"]].map(([label, value, hint]) =>
              <article key={label}><span>{String(label).replace("今日", date === taipeiDate() ? "今日" : "當日")}</span><strong>{Number(value).toLocaleString()}</strong><small>{hint}</small></article>)}
          </section>}
          <Podium rows={data.topThree} />
          {tab === "overview" && <>
            <section className="admin-panel"><h2>接觸人數</h2><div className="admin-counts"><span>原始紀錄 <b>{data.kpis.rawRecords}</b></span><span>重複 <b>{data.kpis.duplicates}</b></span><span>去重複 <b>{data.kpis.contacts} 人</b></span></div><p className="admin-caption">Google 表單 + 正式遊戲登記，依姓名去重；表單不代表試玩人數。</p></section>
            <section className="admin-panel"><h2>接觸趨勢</h2><Bars rows={data.trend.map((row) => ({ name: `${row.hour} 時`, count: row.count }))} /></section>
            <section className="admin-panel"><h2>關主分布</h2><Bars rows={data.gatekeepers} onSelect={selectLeader} /></section>
            <div className="admin-two-panels"><section className="admin-panel"><h2>科系分布</h2><Bars rows={data.departments} /></section><section className="admin-panel"><h2>年級分布</h2><Bars rows={data.grades} /></section></div>
          </>}
        </>}
        {(tab === "contacts" || tab === "results") && <section className="admin-panel">
          <div className="admin-section-heading"><h2>{tab === "contacts" ? "聯絡名單" : "比賽成績"}</h2>{tab === "results" && <button onClick={() => setTab("podium")}>查看前三名</button>}</div>
          <div className="admin-filters">
            <input aria-label="搜尋姓名、電話、科系" placeholder="搜尋姓名、電話、科系" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="篩選關主" value={leader} onChange={(event) => setLeader(event.target.value)}><option value="">所有關主</option>{[...new Set(rows.map((row) => row.gatekeeper))].filter(Boolean).map((name) => <option key={name}>{name}</option>)}</select>
            {tab === "contacts" && <select aria-label="篩選來源" value={source} onChange={(event) => setSource(event.target.value)}><option value="">所有來源</option><option>Google Form</option><option>Focus Challenge</option></select>}
            <select aria-label="篩選科系" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">所有科系</option>{[...new Set(rows.map((row) => row.department))].filter(Boolean).map((name) => <option key={name}>{name}</option>)}</select>
          </div>
          <p className="admin-caption">{filtered.length} 筆紀錄 · 僅工作人員可見</p>
          {!filtered.length ? <p className="admin-empty">{busy ? "讀取中…" : "沒有符合條件的紀錄"}</p> : <>
            <div className="admin-person-list">{filtered.map((row, index) => <article key={`${row.completedAt}-${index}`}>
              <div><strong>{row.name}</strong><span className="admin-badge">{row.source}</span></div>
              <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
              <p>{row.phone || "電話未填"}</p><small>{time(row.completedAt)} · 關主 {row.gatekeeper || "未填"}</small>
              {"score" in row && <b className="admin-person-score">{Number(row.score).toLocaleString()} 分 · 正確率 {(row as Result).accuracy}%</b>}
            </article>)}</div>
            <div className="admin-table-wrap"><table><thead><tr><th>姓名</th><th>時間</th><th>科系／年級</th><th>電話</th><th>來源</th><th>關主</th>{tab === "results" && <th>分數／正確率</th>}</tr></thead>
              <tbody>{filtered.map((row, index) => <tr key={`${row.completedAt}-${index}`}><td>{row.name}</td><td>{time(row.completedAt)}</td><td>{row.department}<small>{row.grade}</small></td><td>{row.phone}</td><td><span className="admin-badge">{row.source}</span></td><td>{row.gatekeeper}</td>{tab === "results" && <td>{(row as Result).score} / {(row as Result).accuracy}%</td>}</tr>)}</tbody></table></div>
          </>}
        </section>}
        {tab === "leaders" && <section className="admin-panel"><h2>關主接觸人數</h2><p className="admin-caption">各關主帶到的去重複人數 · 點擊查看名單</p><Bars rows={data?.gatekeepers ?? []} onSelect={selectLeader} /></section>}
        {tab === "system" && <section className="admin-panel"><h2>系統同步狀態</h2>
          <dl className="admin-system"><dt>Google 表單</dt><dd>{data?.sync.forms.ok ? "● 已連線" : "○ 同步異常"}</dd><dt>正式比賽成績</dt><dd>{data?.sync.results.ok ? "● 已連線" : "○ 同步異常"}</dd><dt>自動更新</dt><dd>每 30 秒</dd><dt>統計時區</dt><dd>Asia/Taipei</dd><dt>最後同步</dt><dd>{data ? time(data.sync.updatedAt) : "—"}</dd></dl>
          <p className="admin-caption">若尚未連線，請由部署管理者設定伺服器環境變數與 Apps Script；不在此頁輸入金鑰。</p>
          <button className="admin-primary" onClick={logout}>安全登出</button>
        </section>}
      </div>
    </main>
  );
}

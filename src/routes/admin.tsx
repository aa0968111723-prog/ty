import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  Flag,
  GripVertical,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Medal,
  MoreVertical,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Settings,
  Sheet,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { AdminLogin } from "@/components/admin-login";
import "@/admin.css";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "禪學社戰情｜淡江大學禪學社" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

type Contact = {
  name: string;
  phone: string;
  department: string;
  grade: string;
  gatekeeper: string;
  source: string;
  completedAt: string;
};
type Result = Contact & {
  id: string;
  submissionId: string;
  score: number;
  accuracy: number;
  correct: number;
  maxCombo: number;
};
type Count = { name: string; count: number };
type Dashboard = {
  date: string;
  contacts: Contact[];
  results: Result[];
  topThree: Result[];
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

const tabs = [
  { id: "overview", label: "總覽", icon: BarChart3 },
  { id: "contacts", label: "名單", icon: Users },
  { id: "results", label: "成績", icon: Trophy },
  { id: "leaders", label: "關主", icon: Flag },
  { id: "system", label: "系統", icon: Settings },
] as const;
type Tab = (typeof tabs)[number]["id"] | "podium" | "pinned";
type WidgetId =
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
type LayoutPreference = { visible: WidgetId[]; order: WidgetId[]; pinned: WidgetId[] };

const WIDGETS: { id: WidgetId; label: string }[] = [
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
const IDS = WIDGETS.map(({ id }) => id);
const DEFAULT_LAYOUT: LayoutPreference = {
  visible: [...IDS],
  order: [...IDS],
  pinned: ["todayContacts", "topThree", "gatekeepers", "recentPlayers"],
};
const STORAGE_KEY = "admin-dashboard-layout";

function validIds(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((id): id is WidgetId => typeof id === "string" && IDS.includes(id as WidgetId)),
    ),
  ];
}
function readLayout(): LayoutPreference {
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
function taipeiDate(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86400000));
}
function time(value: string) {
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
function initialView(): Tab {
  if (typeof window === "undefined") return "overview";
  const view = new URLSearchParams(window.location.search).get("view");
  return (
    (
      {
        today: "overview",
        ranking: "podium",
        contacts: "contacts",
        gatekeepers: "leaders",
        pinned: "pinned",
        form: "contacts",
        results: "results",
        sync: "system",
      } as Record<string, Tab>
    )[view || ""] ?? "overview"
  );
}
function Bars({ rows, onSelect }: { rows: Count[]; onSelect?: (name: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className="admin-empty">這一天還沒有資料</p>;
  return (
    <div className="admin-bars">
      {rows.map((row) => (
        <button
          key={row.name}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(row.name)}
        >
          <span>{row.name}</span>
          <span className="admin-bar-track">
            <i style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <strong>{row.count}</strong>
        </button>
      ))}
    </div>
  );
}
function Podium({ rows, compact = false }: { rows: Result[]; compact?: boolean }) {
  return !rows.length ? (
    <p className="admin-empty">尚無正式挑戰紀錄</p>
  ) : (
    <ol className={`admin-podium${compact ? " is-compact" : ""}`}>
      {rows.map((row, index) => (
        <li key={row.id}>
          <span className={`admin-medal medal-${index}`}>{index + 1}</span>
          <div>
            <strong>{row.name}</strong>
            <small>
              正確率 {row.accuracy}% · 關主 {row.gatekeeper || "未填"}
            </small>
          </div>
          <b>{row.score.toLocaleString()}</b>
        </li>
      ))}
    </ol>
  );
}
function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="admin-widget-kpi">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [date, setDate] = useState(taipeiDate);
  const [tab, setTab] = useState<Tab>(initialView);
  const [data, setData] = useState<Dashboard | null>(null);
  const [todayData, setTodayData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [leader, setLeader] = useState("");
  const [source, setSource] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "form"
      ? "Google Form"
      : "",
  );
  const [department, setDepartment] = useState("");
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [layout, setLayout] = useState<LayoutPreference>(DEFAULT_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    setLayout(readLayout());
    setLayoutReady(true);
  }, []);
  useEffect(() => {
    if (layoutReady) localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout, layoutReady]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/session", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => setAuthenticated(body.authenticated === true))
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    try {
      const current = taipeiDate();
      const load = async (target: string) => {
        const response = await fetch(`/api/admin/dashboard?date=${encodeURIComponent(target)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 401) throw new Error("AUTH");
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "同步失敗");
        return body as Dashboard;
      };
      const selected = await load(date);
      const today = date === current ? selected : await load(current);
      if (id === generation.current) {
        setData(selected);
        setTodayData(today);
        setError("");
      }
    } catch (cause) {
      if (id !== generation.current) return;
      if (cause instanceof Error && cause.message === "AUTH") {
        setAuthenticated(false);
        setData(null);
      } else setError(cause instanceof Error ? cause.message : "同步失敗，請重新整理");
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }, [date]);
  useEffect(() => {
    if (!authenticated) return;
    setData(null);
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearInterval(timer);
    };
  }, [authenticated, refresh]);

  function setView(next: Tab, shortcut?: string) {
    setTab(next);
    const url = new URL(window.location.href);
    if (shortcut) url.searchParams.set("view", shortcut);
    else url.searchParams.delete("view");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }
  async function logout() {
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      generation.current++;
      setAuthenticated(false);
      setData(null);
    } catch {
      setError("登出失敗，請再試一次");
    }
  }
  function toggleVisible(id: WidgetId) {
    setLayout((current) => {
      const visible = current.visible.includes(id)
        ? current.visible.filter((item) => item !== id)
        : [...current.visible, id];
      return {
        ...current,
        visible,
        pinned: current.pinned.filter((item) => visible.includes(item)),
      };
    });
  }
  function togglePinned(id: WidgetId) {
    setLayout((current) => {
      const pinned = current.pinned.includes(id)
        ? current.pinned.filter((item) => item !== id)
        : [...current.pinned, id];
      return {
        ...current,
        pinned,
        visible: current.visible.includes(id) ? current.visible : [...current.visible, id],
      };
    });
  }
  function moveWidget(from: WidgetId, to: WidgetId) {
    if (from === to) return;
    setLayout((current) => {
      const order = current.order.filter((id) => id !== from);
      order.splice(order.indexOf(to), 0, from);
      return { ...current, order };
    });
  }
  function selectLeader(name: string) {
    setLeader(name);
    setView("contacts", "contacts");
  }

  const orderedVisible = useMemo(
    () => layout.order.filter((id) => layout.visible.includes(id)),
    [layout],
  );
  const pinned = orderedVisible.filter((id) => layout.pinned.includes(id));
  const more = orderedVisible.filter((id) => !layout.pinned.includes(id));
  const rows = (tab === "results" ? data?.results : data?.contacts) ?? [];
  const filtered = rows.filter(
    (row) =>
      (!leader || row.gatekeeper === leader) &&
      (tab === "results" || !source || row.source === source) &&
      (!department || row.department === department) &&
      (!query ||
        `${row.name} ${row.phone} ${row.department}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())),
  );

  function widget(id: WidgetId, editor = false): ReactNode {
    if (!data) return null;
    const latestForms = data.contacts.filter((row) => row.source === "Google Form").slice(0, 3);
    const practice = Math.max(0, data.kpis.contacts - data.kpis.officialChallenges);
    let body: ReactNode;
    switch (id) {
      case "todayContacts":
        body = <Kpi label="今日接觸" value={todayData?.kpis.contacts ?? "—"} hint="去重複人數" />;
        break;
      case "dateContacts":
        body = (
          <Kpi
            label={date === taipeiDate() ? "今日接觸" : "當日接觸"}
            value={data.kpis.contacts}
            hint={date.replaceAll("-", " / ")}
          />
        );
        break;
      case "official":
        body = <Kpi label="正式挑戰" value={data.kpis.officialChallenges} hint="完成紀錄" />;
        break;
      case "practice":
        body = <Kpi label="試玩接觸" value={practice} hint="接觸扣除正式挑戰" />;
        break;
      case "highest":
        body = <Kpi label="最高分" value={data.kpis.highestScore} hint="正式挑戰" />;
        break;
      case "average":
        body = <Kpi label="平均分數" value={data.kpis.averageScore} hint="正式挑戰" />;
        break;
      case "topThree":
        body = (
          <>
            <h2>
              <Medal size={20} />
              前三名
            </h2>
            <Podium rows={data.topThree} compact />
          </>
        );
        break;
      case "gatekeepers":
        body = (
          <>
            <h2>關主統計</h2>
            <Bars rows={data.gatekeepers} onSelect={selectLeader} />
          </>
        );
        break;
      case "departments":
        body = (
          <>
            <h2>科系分布</h2>
            <Bars rows={data.departments} />
          </>
        );
        break;
      case "grades":
        body = (
          <>
            <h2>年級分布</h2>
            <Bars rows={data.grades} />
          </>
        );
        break;
      case "latestForms":
        body = (
          <>
            <h2>
              <Sheet size={19} />
              Google 表單最新資料
            </h2>
            {latestForms.length ? (
              <ul className="admin-mini-list">
                {latestForms.map((row, index) => (
                  <li key={`${row.completedAt}-${index}`}>
                    <strong>{row.name}</strong>
                    <span>{time(row.completedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-empty">尚無表單資料</p>
            )}
          </>
        );
        break;
      case "recentPlayers":
        body = (
          <>
            <h2>
              <Trophy size={19} />
              最近參賽者
            </h2>
            {data.results.length ? (
              <ul className="admin-mini-list">
                {[...data.results]
                  .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                  .slice(0, 3)
                  .map((row) => (
                    <li key={row.id}>
                      <strong>{row.name}</strong>
                      <span>{row.score.toLocaleString()} 分</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="admin-empty">尚無參賽紀錄</p>
            )}
          </>
        );
        break;
      case "sync":
        body = (
          <Kpi
            label="最後同步"
            value={time(data.sync.updatedAt)}
            hint={
              data.sync.forms.ok && data.sync.results.ok ? "Google Sheet 已連線" : "部分同步異常"
            }
          />
        );
        break;
      case "system":
        body = (
          <>
            <h2>系統狀態</h2>
            <dl className="admin-system compact">
              <dt>表單</dt>
              <dd>{data.sync.forms.ok ? "正常" : "異常"}</dd>
              <dt>成績</dt>
              <dd>{data.sync.results.ok ? "正常" : "異常"}</dd>
              <dt>自動更新</dt>
              <dd>30 秒</dd>
            </dl>
          </>
        );
        break;
    }
    return (
      <article
        key={id}
        data-widget={id}
        className={`admin-widget ${layout.pinned.includes(id) ? "is-pinned" : ""} ${!layout.visible.includes(id) ? "is-hidden" : ""}`}
        draggable={editor}
        onDragStart={() => setDragging(id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => {
          if (dragging) moveWidget(dragging, id);
          setDragging(null);
        }}
      >
        {editor && (
          <div className="admin-widget-tools">
            <MoreVertical size={18} aria-hidden="true" />
            <button
              onClick={() => togglePinned(id)}
              aria-label={`${layout.pinned.includes(id) ? "取消釘選" : "釘選"}${WIDGETS.find((item) => item.id === id)?.label}`}
            >
              {layout.pinned.includes(id) ? <PinOff size={18} /> : <Pin size={18} />}
            </button>
            <button
              onClick={() => toggleVisible(id)}
              aria-label={`${layout.visible.includes(id) ? "隱藏" : "顯示"}${WIDGETS.find((item) => item.id === id)?.label}`}
            >
              {layout.visible.includes(id) ? <X size={18} /> : <Check size={18} />}
            </button>
            <span className="admin-drag-handle" aria-label="拖曳排序">
              <GripVertical size={20} />
            </span>
          </div>
        )}
        {body}
        {editor && !layout.visible.includes(id) && (
          <span className="admin-hidden-label">已隱藏</span>
        )}
      </article>
    );
  }

  if (authenticated === null)
    return (
      <main className="admin-page">
        <p role="status">正在確認登入狀態…</p>
      </main>
    );
  if (!authenticated)
    return (
      <main className="admin-page admin-auth">
        <AdminLogin onSuccess={() => setAuthenticated(true)} />
      </main>
    );
  return (
    <main className="admin-page">
      <aside className="admin-nav">
        <a className="admin-brand" href="/">
          <img src="/club-mark.svg" alt="" />
          <span>
            淡江大學禪學社<small>Focus Challenge</small>
          </span>
        </a>
        <nav aria-label="後台導覽">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setView(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="admin-logout" onClick={logout}>
          <LogOut size={18} />
          登出
        </button>
      </aside>
      <div className="admin-content">
        <header className="admin-heading">
          <div>
            <span className="admin-eyebrow">淡江大學禪學社 · 工作人員專用</span>
            <h1>{tab === "pinned" ? "我的戰情" : "社博即時戰情"}</h1>
            <p>{date.replaceAll("-", " / ")}</p>
          </div>
          <div className="admin-heading-actions">
            {(tab === "overview" || tab === "pinned") && (
              <button
                className={editing ? "admin-done" : "admin-customize"}
                onClick={() => setEditing((value) => !value)}
                aria-label={editing ? "完成" : "自訂"}
              >
                {editing ? <Check size={19} /> : <LayoutDashboard size={19} />}
                <span>{editing ? "完成" : "自訂"}</span>
              </button>
            )}
            <button
              className="admin-refresh"
              disabled={busy}
              onClick={() => void refresh()}
              aria-label="更新資料"
            >
              <RefreshCw size={20} className={busy ? "admin-spinning" : ""} />
              <span>更新</span>
            </button>
          </div>
        </header>
        <div className="admin-date-controls">
          <button aria-pressed={date === taipeiDate()} onClick={() => setDate(taipeiDate())}>
            今天
          </button>
          <button aria-pressed={date === taipeiDate(-1)} onClick={() => setDate(taipeiDate(-1))}>
            昨天
          </button>
          <label>
            自訂日期
            <input
              aria-label="查詢日期"
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
            />
          </label>
        </div>
        <div className="admin-sync-line" role="status">
          <span>
            {data
              ? data.sync.forms.ok && data.sync.results.ok && !error
                ? "● 已連線"
                : "○ 同步異常 · 部分資料可能缺漏"
              : busy
                ? "同步中…"
                : "尚未同步"}
          </span>
          <span>最後同步 {data ? time(data.sync.updatedAt) : "—"}</span>
        </div>
        {error && (
          <p className="admin-error" role="alert">
            {error} · 保留上次成功資料
          </p>
        )}

        {data && (tab === "overview" || tab === "pinned") && (
          <>
            {editing ? (
              <section className="admin-editor" aria-label="自訂儀表板">
                <div className="admin-editor-heading">
                  <div>
                    <h2>自訂儀表板</h2>
                    <p>拖曳卡片排序，並選擇要顯示或釘選的資訊。</p>
                  </div>
                  <button onClick={() => setLayout(DEFAULT_LAYOUT)}>
                    <RotateCcw size={17} />
                    恢復預設
                  </button>
                </div>
                <div className="admin-widget-grid is-editing">
                  {layout.order.map((id) => widget(id, true))}
                </div>
              </section>
            ) : (
              <>
                <section
                  className="admin-widget-grid admin-pinned-grid"
                  aria-label={tab === "pinned" ? "我的戰情" : "釘選資訊"}
                >
                  {pinned.map((id) => widget(id))}
                  {!pinned.length && (
                    <div className="admin-panel admin-empty">
                      尚未釘選卡片，點「自訂」開始設定。
                    </div>
                  )}
                </section>
                {tab === "overview" && more.length > 0 && (
                  <section className="admin-more">
                    <button
                      className="admin-more-toggle"
                      aria-expanded={showMore}
                      onClick={() => setShowMore((value) => !value)}
                    >
                      <span>
                        <ListFilter size={19} />
                        更多資訊
                      </span>
                      <ChevronDown size={20} className={showMore ? "is-open" : ""} />
                    </button>
                    {showMore && (
                      <div className="admin-widget-grid">{more.map((id) => widget(id))}</div>
                    )}
                  </section>
                )}
                <section className="admin-quick" aria-label="快速入口">
                  <h2>快速入口</h2>
                  <div>
                    {[
                      ["名單", Users, "contacts", "contacts"],
                      ["前三名", Medal, "podium", "ranking"],
                      ["關主", Flag, "leaders", "gatekeepers"],
                      ["表單", Sheet, "contacts", "form"],
                      ["成績", Trophy, "results", "results"],
                      ["同步", RefreshCw, "system", "sync"],
                    ].map(([label, Icon, next, shortcut]) => (
                      <button
                        key={label as string}
                        onClick={() => {
                          setSource(shortcut === "form" ? "Google Form" : "");
                          setView(next as Tab, shortcut as string);
                        }}
                      >
                        <Icon size={21} />
                        <span>{label as string}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {data && tab === "podium" && (
          <section className="admin-panel">
            <h2>
              <Medal size={20} /> {date === taipeiDate() ? "今日" : "當日"}前三名
            </h2>
            <p className="admin-caption">僅正式挑戰 · 指定日期 · 排名不公開</p>
            <Podium rows={data.topThree} />
          </section>
        )}
        {(tab === "contacts" || tab === "results") && (
          <section className="admin-panel">
            <div className="admin-section-heading">
              <h2>{tab === "contacts" ? "聯絡名單" : "比賽成績"}</h2>
              {tab === "results" && (
                <button onClick={() => setView("podium", "ranking")}>查看前三名</button>
              )}
            </div>
            <div className="admin-filters">
              <input
                aria-label="搜尋姓名、電話、科系"
                placeholder="搜尋姓名、電話、科系"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label="篩選關主"
                value={leader}
                onChange={(event) => setLeader(event.target.value)}
              >
                <option value="">所有關主</option>
                {[...new Set(rows.map((row) => row.gatekeeper))].filter(Boolean).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              {tab === "contacts" && (
                <select
                  aria-label="篩選來源"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="">所有來源</option>
                  <option>Google Form</option>
                  <option>Focus Challenge</option>
                </select>
              )}
              <select
                aria-label="篩選科系"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <option value="">所有科系</option>
                {[...new Set(rows.map((row) => row.department))].filter(Boolean).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
            <p className="admin-caption">{filtered.length} 筆紀錄 · 僅工作人員可見</p>
            {!filtered.length ? (
              <p className="admin-empty">{busy ? "讀取中…" : "沒有符合條件的紀錄"}</p>
            ) : (
              <>
                <div className="admin-person-list">
                  {filtered.map((row, index) => (
                    <article key={`${row.completedAt}-${index}`}>
                      <div>
                        <strong>{row.name}</strong>
                        <span className="admin-badge">{row.source}</span>
                      </div>
                      <p>
                        {row.department || "科系未填"} · {row.grade || "年級未填"}
                      </p>
                      <p>{row.phone || "電話未填"}</p>
                      <small>
                        {time(row.completedAt)} · 關主 {row.gatekeeper || "未填"}
                      </small>
                      {"score" in row && (
                        <b className="admin-person-score">
                          {Number(row.score).toLocaleString()} 分 · 正確率{" "}
                          {(row as Result).accuracy}%
                        </b>
                      )}
                    </article>
                  ))}
                </div>
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>姓名</th>
                        <th>時間</th>
                        <th>科系／年級</th>
                        <th>電話</th>
                        <th>來源</th>
                        <th>關主</th>
                        {tab === "results" && <th>分數／正確率</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, index) => (
                        <tr key={`${row.completedAt}-${index}`}>
                          <td>{row.name}</td>
                          <td>{time(row.completedAt)}</td>
                          <td>
                            {row.department}
                            <small>{row.grade}</small>
                          </td>
                          <td>{row.phone}</td>
                          <td>
                            <span className="admin-badge">{row.source}</span>
                          </td>
                          <td>{row.gatekeeper}</td>
                          {tab === "results" && (
                            <td>
                              {(row as Result).score} / {(row as Result).accuracy}%
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
        {tab === "leaders" && (
          <section className="admin-panel">
            <h2>關主接觸人數</h2>
            <p className="admin-caption">各關主帶到的去重複人數 · 點擊查看名單</p>
            <Bars rows={data?.gatekeepers ?? []} onSelect={selectLeader} />
          </section>
        )}
        {tab === "system" && (
          <section className="admin-panel">
            <h2>系統同步狀態</h2>
            <dl className="admin-system">
              <dt>Google 表單</dt>
              <dd>{data?.sync.forms.ok ? "● 已連線" : "○ 同步異常"}</dd>
              <dt>正式比賽成績</dt>
              <dd>{data?.sync.results.ok ? "● 已連線" : "○ 同步異常"}</dd>
              <dt>自動更新</dt>
              <dd>每 30 秒</dd>
              <dt>統計時區</dt>
              <dd>Asia/Taipei</dd>
              <dt>最後同步</dt>
              <dd>{data ? time(data.sync.updatedAt) : "—"}</dd>
            </dl>
            <p className="admin-caption">
              若尚未連線，請由部署管理者設定伺服器環境變數與 Apps Script；不在此頁輸入金鑰。
            </p>
            <button className="admin-primary" onClick={logout}>
              安全登出
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

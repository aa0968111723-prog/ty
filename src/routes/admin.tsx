import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, LayoutDashboard, RefreshCw, RotateCcw } from "lucide-react";
import { AdminShell } from "@/components/club/admin-shell";
import { AdminLogin, type AdminGate } from "@/components/admin-login";
import { publicAdminError } from "@/lib/club/public-error.mjs";
import { AdminSecurity } from "@/components/club/admin-security";
import "@/admin.css";
import { DashboardWidget } from "@/components/club/dashboard-widget";
import { DEFAULT_LAYOUT, STORAGE_KEY, readLayout, initialView, taipeiDate, time, type Dashboard, type Tab, type LayoutPreference, type WidgetId } from "@/components/club/admin-presentation";
import { RecruitmentDashboard, RecruitmentSync, type RecruitmentData } from "@/components/club/recruitment-dashboard";
import { AdminPublicRanking } from "@/components/club/admin-ranking";
import { SyncPill } from "@/components/club/battle-kpis";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "禪學社專注力挑戰｜淡江大學禪學社" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

const titles: Record<string, string> = {
  recruitment: "今日招生戰情",
  queue: "待處理",
  roster: "名單",
  pinned: "我的釘選",
  podium: "今日排行榜",
  history: "歷史排行榜",
  forms: "表單資料",
  system: "同步狀態",
  security: "系統設定",
  overview: "活動總覽",
  contacts: "名單",
  results: "今日排行榜",
  leaders: "關主",
};

function AdminDashboard() {
  const [gate, setGate] = useState<AdminGate | null>(null);
  const authenticated = gate?.authenticated === true && !gate.setupRequired;
  const [date, setDate] = useState(taipeiDate);
  const [tab, setTab] = useState<Tab>(initialView);
  const [data, setData] = useState<Dashboard | null>(null);
  const [todayData, setTodayData] = useState<Dashboard | null>(null);
  const [recruitment, setRecruitment] = useState<RecruitmentData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [leader, setLeader] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [track, setTrack] = useState("pending");
  const [source, setSource] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "form"
      ? "Google Form"
      : "",
  );
  const [department, setDepartment] = useState("");
  const [editing, setEditing] = useState(false);
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
      .then((body) => setGate(body))
      .catch(() => {
        if (!controller.signal.aborted) setGate({ authenticated: false });
      });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async (force = false) => {
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
        if (!response.ok) throw new Error(publicAdminError(body.error, "同步失敗"));
        return body as Dashboard;
      };
      const loadRecruitment = async (target: string) => {
        const response = await fetch(
          `/api/admin/recruitment?date=${encodeURIComponent(target)}${force ? "&refresh=1" : ""}`,
          { cache: "no-store", signal: AbortSignal.timeout(15000) },
        );
        if (response.status === 401) throw new Error("AUTH");
        const body = await response.json();
        if (!response.ok) throw new Error(publicAdminError(body.error, "同步失敗"));
        return body as RecruitmentData;
      };
      const [selected, today, board] = await Promise.allSettled([
        load(date),
        date === current ? load(date) : load(current),
        loadRecruitment(date),
      ]);
      if (id !== generation.current) return;
      const authFail = [selected, today, board].some((item) => item.status === "rejected" && item.reason instanceof Error && item.reason.message === "AUTH");
      if (authFail) throw new Error("AUTH");
      if (selected.status === "fulfilled") setData(selected.value);
      if (today.status === "fulfilled") setTodayData(today.value);
      else if (selected.status === "fulfilled") setTodayData(selected.value);
      if (board.status === "fulfilled") setRecruitment(board.value);
      const failures = [selected, board].filter((item) => item.status === "rejected");
      setError(failures.length ? "同步失敗，保留上次成功資料" : "");
    } catch (cause) {
      if (id !== generation.current) return;
      if (cause instanceof Error && cause.message === "AUTH") {
        setGate((currentGate) => ({
          ...(currentGate || { authenticated: false }),
          authenticated: false,
          setupRequired: false,
          sessionExpired: true,
        }));
        setData(null);
        setRecruitment(null);
      } else setError(cause instanceof Error ? publicAdminError(cause.message, "同步失敗，請重新整理") : "同步失敗，請重新整理");
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }, [date]);
  useEffect(() => {
    if (!authenticated) return;
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
    setEditing(false);
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
      const nextGate = await fetch("/api/admin/session").then((res) => res.json()).catch(() => ({ authenticated: false }));
      setGate({ ...nextGate, sessionExpired: false });
      setData(null);
      setRecruitment(null);
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
      const order = current.order.filter((widgetId) => widgetId !== from);
      order.splice(order.indexOf(to), 0, from);
      return { ...current, order };
    });
  }
  function selectLeader(name: string) {
    setLeader(name);
    setView("roster", "contacts");
  }

  const orderedVisible = useMemo(
    () => layout.order.filter((id) => layout.visible.includes(id)),
    [layout],
  );
  const pinned = orderedVisible.filter((id) => layout.pinned.includes(id));
  const formRows = (data?.contacts ?? []).filter((row) => row.source === "Google Form");
  const filteredForms = formRows.filter(
    (row) =>
      (!leader || row.gatekeeper === leader) &&
      (!department || row.department === department) &&
      (!query ||
        `${row.name} ${row.phone} ${row.department}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())),
  );

  function widget(id: WidgetId, editor = false) {
    return <DashboardWidget key={id} id={id} editor={editor} data={data} todayData={todayData} date={date} layout={layout} dragging={dragging} setDragging={setDragging} togglePinned={togglePinned} toggleVisible={toggleVisible} moveWidget={moveWidget} selectLeader={selectLeader} />;
  }

  if (gate === null)
    return (
      <main className="admin-page admin-auth">
        <p role="status">正在確認登入狀態…</p>
      </main>
    );
  if (!authenticated)
    return (
      <main className="admin-page admin-auth">
        <AdminLogin
          gate={gate}
          onSuccess={() => {
            const standalone = window.matchMedia("(display-mode: standalone)").matches
              || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
            const url = new URL(window.location.href);
            if (standalone && url.searchParams.get("view") !== "pinned") {
              url.searchParams.set("view", "pinned");
              window.history.replaceState({}, "", `${url.pathname}${url.search}`);
              setTab("pinned");
            }
            fetch("/api/admin/session")
              .then((response) => response.json())
              .then((body) => setGate(body));
          }}
        />
      </main>
    );

  const boardMode = tab === "queue" ? "queue" : tab === "roster" || tab === "contacts" ? "roster" : "command";

  return (
    <AdminShell
      view={tab}
      forms={tab === "forms" || source === "Google Form"}
      onLogout={() => void logout()}
      onNavigate={(view, shortcut) => {
        setSource(shortcut === "form" ? "Google Form" : "");
        setLeader("");
        setDepartment("");
        setQuery("");
        setRecruiter("");
        setTrack(view === "queue" ? "pending" : "");
        setView(view, shortcut);
      }}
    >
      <header className="admin-heading">
        <div>
          <span className="admin-eyebrow">招生工作台 / {date.replaceAll("-", ".")}</span>
          <h1>{titles[tab] || "今日招生戰情"}</h1>
          <p>115-1 社團博覽會</p>
        </div>
        <div className="admin-heading-actions">
          {tab === "pinned" && (
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
            onClick={() => void refresh(true)}
            aria-label="更新資料"
          >
            <RefreshCw size={20} className={busy ? "admin-spinning" : ""} />
            <span>更新</span>
          </button>
        </div>
      </header>
      {(tab === "recruitment" || tab === "roster" || tab === "queue" || tab === "forms" || tab === "pinned") && (
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
      )}
      <div className="admin-sync-line" role="status">
        <SyncPill data={recruitment} error={error} />
        <span>最後同步 {recruitment || data ? time((recruitment?.sync.updatedAt || data?.sync.updatedAt) as string) : "—"}</span>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error} · 畫面會保留上次成功資料
        </p>
      )}
      {busy && !recruitment && !data && (
        <p className="admin-empty" role="status">同步中…</p>
      )}

      {(tab === "recruitment" || tab === "queue" || tab === "roster" || tab === "contacts") && (
        recruitment ? (
          <RecruitmentDashboard
            data={recruitment}
            mode={boardMode}
            query={query}
            setQuery={setQuery}
            gameGatekeeper={leader}
            setGameGatekeeper={setLeader}
            recruiter={recruiter}
            setRecruiter={setRecruiter}
            status={track}
            setStatus={setTrack}
            date={date}
            setDate={setDate}
            onOpenQueue={() => setView("queue", "queue")}
            onOpenRoster={() => setView("roster", "contacts")}
          />
        ) : (
          <section className="admin-panel" role="alert">
            <h2>{busy ? "讀取招生資料…" : "招生資料暫時無法載入"}</h2>
            <p className="admin-caption">同步失敗時畫面不會空白。可再同步一次，或先從「更多」看公開排行榜。</p>
            {!busy ? (
              <button type="button" className="admin-primary" onClick={() => void refresh(true)}>
                重新同步
              </button>
            ) : null}
          </section>
        )
      )}

      {tab === "pinned" && (
        <>
          {editing ? (
            <section className="admin-editor" aria-label="自訂儀表板">
              <div className="admin-editor-heading">
                <div>
                  <h2>自訂儀表板</h2>
                  <p>拖曳排序，或點排序圖示向前移動；可隱藏與釘選資訊。</p>
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
            <section className="admin-widget-grid admin-pinned-grid" aria-label="我的戰情">
              {data ? pinned.map((id) => widget(id)) : <div className="admin-panel admin-empty">{busy ? "讀取中…" : "尚無釘選資料"}</div>}
              {data && !pinned.length && (
                <div className="admin-panel admin-empty">尚未釘選卡片，點「自訂」開始設定。</div>
              )}
            </section>
          )}
        </>
      )}

      {(tab === "podium" || tab === "results") && <AdminPublicRanking scope="today" />}
      {tab === "history" && <AdminPublicRanking scope="history" />}

      {tab === "forms" && (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <h2>表單資料</h2>
          </div>
          <div className="admin-filters recruitment-filters is-open">
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
              {[...new Set(formRows.map((row) => row.gatekeeper))].filter(Boolean).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label="篩選來源"
              value="Google Form"
              onChange={() => undefined}
            >
              <option value="Google Form">Google 表單</option>
            </select>
            <select
              aria-label="篩選科系"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">所有科系</option>
              {[...new Set(formRows.map((row) => row.department))].filter(Boolean).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </div>
          <p className="admin-caption">{filteredForms.length} 筆紀錄 · 僅工作人員可見</p>
          {!filteredForms.length ? (
            <p className="admin-empty">{busy ? "讀取中…" : "沒有符合條件的紀錄"}</p>
          ) : (
            <div className="admin-person-list">
              {filteredForms.map((row, index) => (
                <article key={`${row.completedAt}-${index}`}>
                  <div>
                    <strong>{row.name}</strong>
                    <span className="admin-badge">{row.source === "Google Form" ? "Google 表單" : row.source}</span>
                  </div>
                  <p>
                    {row.department || "科系未填"} · {row.grade || "年級未填"}
                  </p>
                  <p>{row.phone || "電話未填"}</p>
                  <small>
                    {time(row.completedAt)} · 關主 {row.gatekeeper || "未填"}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "security" && <AdminSecurity />}
      {tab === "system" && (
        <section className="admin-panel">
          <h2>系統同步狀態</h2>
          {recruitment ? <RecruitmentSync data={recruitment} /> : (
            <dl className="admin-system">
              <dt>Google 表單</dt>
              <dd>{data?.sync.forms.ok ? "● 已連線" : "○ 同步失敗"}</dd>
              <dt>正式比賽成績</dt>
              <dd>{data?.sync.results.ok ? "● 已連線" : "○ 同步失敗"}</dd>
            </dl>
          )}
          <dl className="admin-system">
            <dt>自動更新</dt>
            <dd>每 30 秒</dd>
            <dt>統計時區</dt>
            <dd>台北時間</dd>
            <dt>最後同步</dt>
            <dd>{recruitment || data ? time((recruitment?.sync.updatedAt || data?.sync.updatedAt) as string) : "—"}</dd>
          </dl>
          <p className="admin-caption">若同步失敗，請聯絡部署管理者檢查資料表連線設定。單一來源失敗時會保留其他成功資料。</p>
          <button className="admin-primary" onClick={logout}>
            安全登出
          </button>
        </section>
      )}
    </AdminShell>
  );
}

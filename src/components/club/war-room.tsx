import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  ChevronDown,
  CircleAlert,
  Coins,
  Gamepad2,
  Ticket,
  UserPlus,
  Users,
  ClipboardList,
} from "lucide-react";
import type { KpiPersonChip, RecruitmentData, SyncFlag } from "./recruitment-dashboard";

function metric(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("zh-Hant");
}

/** Missing payload → em dash. Loaded empty sheets still show 0. */
function kpiCount(value: number | null | undefined, ready: boolean, busy: boolean) {
  if (typeof value === "number") return value;
  if (busy) return "…";
  return ready ? 0 : "—";
}

function Ring({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const safeMax = Math.max(max, value, 1);
  const pct = Math.max(0, Math.min(1, value / safeMax));
  const radius = 34;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  return (
    <svg className="war-ring" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r={radius} className="war-ring-track" />
      <circle
        cx="40"
        cy="40"
        r={radius}
        className="war-ring-value"
        strokeDasharray={`${dash} ${circ}`}
      />
    </svg>
  );
}

function KpiCard({
  id,
  label,
  value,
  hint,
  icon,
  details,
  tone = "plain",
}: {
  id: string;
  label: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
  details: ReactNode;
  tone?: "plain" | "warn" | "ok";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    document.querySelector(`[data-kpi="${id}"]`)?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }, [open, id]);
  return (
    <article className={`war-card tone-${tone}${open ? " is-open" : ""}`} data-kpi={id}>
      <button
        type="button"
        className="war-card-hit"
        aria-expanded={open}
        aria-controls={`${id}-detail`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="war-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="war-copy">
          <span className="war-label">{label}</span>
          <strong className="war-num">{typeof value === "number" ? metric(value) : value}</strong>
          <small>{hint}</small>
        </span>
        {typeof value === "number" ? <Ring value={value} max={Math.max(value, 8)} /> : null}
        <ChevronDown className={`war-caret${open ? " is-open" : ""}`} size={18} aria-hidden="true" />
      </button>
      <div id={`${id}-detail`} hidden={!open} className="war-card-detail">
        {details}
      </div>
    </article>
  );
}

function NamePeek({
  names,
  missing,
  empty,
  actionLabel,
  onAction,
}: {
  names: KpiPersonChip[];
  missing?: boolean;
  empty: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const shown = names.slice(0, 6);
  const rest = names.length - shown.length;
  return (
    <div className="war-peek">
      {missing ? (
        <p>名單暫缺，不是 0 人。</p>
      ) : !names.length ? (
        <p>{empty}</p>
      ) : (
        <ul className="war-name-chips">
          {shown.map((row) => (
            <li key={row.personKey}>{row.name}</li>
          ))}
          {rest > 0 ? <li className="is-more">還有 {rest} 人</li> : null}
        </ul>
      )}
      {actionLabel && onAction ? (
        <button type="button" className="admin-primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function syncTone(ok: boolean | undefined, stale?: boolean) {
  if (ok) return "已連線";
  if (stale) return "等待中";
  return "失敗";
}

export function WarRoom({
  data,
  busy,
  error,
  onOpenPending,
  onOpenRoster,
}: {
  data: RecruitmentData | null;
  busy: boolean;
  error: string;
  onOpenPending: () => void;
  onOpenRoster: (activity?: string) => void;
}) {
  const [openEvent, setOpenEvent] = useState("");
  const summary = data?.summary;
  const events = data?.events || summary?.events || [];
  const trend = data?.trend || [];
  const funnel = useMemo(() => data?.funnel || [], [data]);
  const maxTrend = Math.max(1, ...trend.flatMap((row) => [row.contacts, row.signups, row.joined]));
  const ready = Boolean(data);
  const pending = kpiCount(summary?.pending, ready, busy);
  const lists = data?.kpiPeople;
  const sync = data?.sync;
  const overall = sync
    ? sync.gameResults.ok && sync.recruitmentResponses.ok && sync.recruitmentMaster.ok
      ? "success"
      : sync.gameResults.stale || sync.recruitmentResponses.stale
        ? "wait"
        : "fail"
    : busy
      ? "wait"
      : "fail";

  const funnelMax = Math.max(1, ...funnel.map((layer) => layer.count || 0));

  if (!data && !error) {
    return (
      <div className="war-room" role="status">
        <p className="admin-empty">{busy ? "正在同步今日招生戰情…" : "尚無戰情資料"}</p>
      </div>
    );
  }

  return (
    <div className="war-room">
      <section
        className={`war-sync is-${overall}`}
        aria-label="資料同步狀態"
        role={overall === "fail" || error ? "alert" : "status"}
      >
        <span className="war-sync-dot" aria-hidden="true" />
        <div>
          <strong>
            {overall === "success" ? "資料已同步" : overall === "wait" ? "同步等待中" : "同步失敗"}
          </strong>
          <small>
            {error && !data
              ? `${error} · 數字暫缺，不是 0 人`
              : error
                ? `${error} · 顯示上次資料`
                : sync
                  ? `最後同步 ${syncClock(sync.updatedAt)}`
                  : busy
                    ? "讀取中"
                    : "尚無資料"}
          </small>
        </div>
        <ul>
          <li>遊戲 {flagLabel(sync?.gameResults)}</li>
          <li>招生表 {flagLabel(sync?.recruitmentResponses)}</li>
          <li>總表 {flagLabel(sync?.recruitmentMaster)}</li>
        </ul>
      </section>

      <section className="war-kpis" aria-label="今日招生數字">
        <KpiCard
          id="today-contacts"
          label="今日接觸人數"
          value={kpiCount(summary?.playedToday, ready, busy)}
          hint="今天完成遊戲 · 去重"
          icon={<Gamepad2 size={22} />}
          details={
            <NamePeek
              names={lists?.todayContacts || []}
              missing={!ready}
              empty="今天還沒有新的接觸"
              actionLabel="到名單"
              onAction={() => onOpenRoster()}
            />
          }
        />
        <KpiCard
          id="all-contacts"
          label="累積接觸人數"
          value={kpiCount(summary?.playedAll, ready, busy)}
          hint="歷史正式遊戲"
          icon={<Users size={22} />}
          details={
            <NamePeek
              names={lists?.allContacts || []}
              missing={!ready}
              empty="尚無正式遊戲接觸"
              actionLabel="到名單"
              onAction={() => onOpenRoster()}
            />
          }
        />
        <KpiCard
          id="today-events"
          label="今日活動報名人數"
          value={summary?.activityToday ?? "—"}
          hint="今天報名至少一場"
          icon={<CalendarCheck size={22} />}
          tone={summary?.activityToday ? "ok" : "plain"}
          details={
            <NamePeek
              names={lists?.todayEvents || []}
              missing={!ready || summary?.activityToday == null}
              empty="今天還沒有活動報名"
              actionLabel="到名單"
              onAction={() => onOpenRoster()}
            />
          }
        />
        <KpiCard
          id="joined"
          label="入社人數"
          value={summary?.joined ?? "—"}
          hint="正式表單「是」"
          icon={<UserPlus size={22} />}
          details={
            <NamePeek
              names={lists?.joined || []}
              missing={!ready || summary?.joined == null}
              empty="尚無入社紀錄"
              actionLabel="到名單"
              onAction={() => onOpenRoster()}
            />
          }
        />
        <KpiCard
          id="deposit"
          label="已繳保證金"
          value={summary?.depositPaid ?? "—"}
          hint="正式表單「是」"
          icon={<Coins size={22} />}
          details={
            <NamePeek
              names={lists?.deposit || []}
              missing={!ready || summary?.depositPaid == null}
              empty="尚無保證金紀錄"
              actionLabel="到名單"
              onAction={() => onOpenRoster()}
            />
          }
        />
        <KpiCard
          id="pending"
          label="待填正式招生資料"
          value={pending}
          hint="玩過遊戲尚未填表"
          icon={<ClipboardList size={22} />}
          tone={typeof pending === "number" && pending ? "warn" : ready ? "ok" : "plain"}
          details={
            <NamePeek
              names={lists?.pending || []}
              missing={!ready}
              empty={summary?.conflicts ? `${summary.conflicts} 筆需要確認，不會自動合併。` : "目前沒有待填正式資料"}
              actionLabel="去待處理"
              onAction={onOpenPending}
            />
          }
        />
      </section>

      <section className="admin-panel war-funnel" aria-label="招生漏斗">
        <h2>遊戲接觸 → 活動報名 → 入社 → 保證金</h2>
        {!funnel.length ? (
          <p className="admin-empty">{error ? "漏斗數字暫缺，不是 0 人" : "尚無接觸資料"}</p>
        ) : (
        <ol>
          {funnel.map((layer) => (
            <li key={layer.id}>
              <span className="war-funnel-icon" aria-hidden="true">
                {layer.id === "played" ? <Gamepad2 size={18} /> : null}
                {layer.id === "activity" ? <Ticket size={18} /> : null}
                {layer.id === "joined" ? <UserPlus size={18} /> : null}
                {layer.id === "deposit" ? <Coins size={18} /> : null}
              </span>
              <strong>{layer.label}</strong>
              <b>{layer.missing || layer.count == null ? "資料不足" : metric(layer.count)}</b>
              <span className="war-funnel-bar" aria-hidden="true">
                <i style={{ width: `${layer.count == null ? 0 : (layer.count / funnelMax) * 100}%` }} />
              </span>
              <small>
                {layer.fromStart == null ? "—" : `佔接觸 ${layer.fromStart}%`}
              </small>
            </li>
          ))}
        </ol>
        )}
      </section>

      <section className="admin-panel war-events" aria-label="各活動報名人數">
        <h2>
          <Ticket size={18} aria-hidden="true" /> 各活動報名人數
        </h2>
        {!events.length ? (
          <p className="admin-empty">{error ? "活動人數暫缺，不是沒有人報名" : "尚無活動選項"}</p>
        ) : (
          <div className="war-event-bars">
            {events.map((row) => (
              <button
                key={row.name}
                type="button"
                data-event={row.name}
                aria-pressed={openEvent === row.name}
                aria-expanded={openEvent === row.name}
                aria-controls={openEvent === row.name ? "war-event-detail" : undefined}
                onClick={() => setOpenEvent((current) => (current === row.name ? "" : row.name))}
              >
                <span className="war-event-name">
                  <Ticket size={16} aria-hidden="true" />
                  {row.name}
                </span>
                <span className="admin-bar-track">
                  <i
                    style={{
                      width: `${(row.count / Math.max(1, ...events.map((item) => item.count))) * 100}%`,
                    }}
                  />
                </span>
                <strong aria-label={`${row.name} ${row.count} 人`}>{row.count}</strong>
              </button>
            ))}
          </div>
        )}
        {openEvent ? (
          <div id="war-event-detail" className="war-event-detail" data-event-detail={openEvent}>
            <NamePeek
              names={events.find((row) => row.name === openEvent)?.people || []}
              missing={!ready}
              empty={`${openEvent} 目前還沒有人報名`}
              actionLabel="到名單篩選"
              onAction={() => onOpenRoster(openEvent)}
            />
          </div>
        ) : null}
      </section>

      <section className="admin-panel war-trend" aria-label="近七日接觸、報名、入社">
        <h2>近七日走勢</h2>
        <ul className="war-trend-legend">
          <li>接 接觸</li>
          <li className="is-signup">報 活動報名</li>
          <li className="is-joined">社 入社</li>
        </ul>
        {!trend.length ? (
          <p className="admin-empty">{error ? "近七日走勢暫缺" : "尚無走勢"}</p>
        ) : (
        <ol className="war-trend-chart">
          {trend.map((row) => (
            <li
              key={row.date}
              className="war-trend-day"
              aria-label={`${row.date} 接觸 ${row.contacts}、活動報名 ${row.signups}、入社 ${row.joined}`}
            >
              <div className="war-trend-cols" aria-hidden="true">
                <span style={{ height: `${(row.contacts / maxTrend) * 100}%` }} />
                <span className="is-signup" style={{ height: `${(row.signups / maxTrend) * 100}%` }} />
                <span className="is-joined" style={{ height: `${(row.joined / maxTrend) * 100}%` }} />
              </div>
              <p className="war-trend-readout">
                <span>
                  <span className="war-trend-key">接</span>
                  {row.contacts}
                </span>
                <span className="is-signup">
                  <span className="war-trend-key">報</span>
                  {row.signups}
                </span>
                <span className="is-joined">
                  <span className="war-trend-key">社</span>
                  {row.joined}
                </span>
              </p>
              <small>{`${Number(row.date.slice(5, 7))}/${Number(row.date.slice(8))}`}</small>
            </li>
          ))}
        </ol>
        )}
      </section>

      {summary?.conflicts ? (
        <p className="admin-caption war-conflict">
          <CircleAlert size={16} aria-hidden="true" /> {summary.conflicts} 筆需要確認，不會自動合併。
        </p>
      ) : null}
    </div>
  );
}

function flagLabel(flag: SyncFlag | undefined) {
  if (!flag) return "等待中";
  return syncTone(flag.ok, flag.stale);
}

function syncClock(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString("zh-TW", { hour12: false, timeZone: "Asia/Taipei" });
}

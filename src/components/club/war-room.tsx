import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CircleAlert,
  Coins,
  Gamepad2,
  Ticket,
  UserPlus,
  Users,
  ClipboardList,
} from "lucide-react";
import type { RecruitmentData, SyncFlag } from "./recruitment-dashboard";

function metric(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("zh-Hant");
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
  return (
    <article className={`war-card tone-${tone}${open ? " is-open" : ""}`}>
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
      </button>
      <div id={`${id}-detail`} hidden={!open} className="war-card-detail">
        {details}
      </div>
    </article>
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
  onOpenRoster: () => void;
}) {
  const [openEvent, setOpenEvent] = useState("");
  const summary = data?.summary;
  const events = data?.events || summary?.events || [];
  const trend = data?.trend || [];
  const funnel = useMemo(() => data?.funnel || [], [data]);
  const maxTrend = Math.max(1, ...trend.flatMap((row) => [row.contacts, row.signups, row.joined]));
  const pending = summary?.pending ?? 0;
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

  if (!data && !error && busy) {
    return (
      <div className="war-room" role="status">
        <p className="admin-empty">正在同步今日招生戰情…</p>
      </div>
    );
  }

  return (
    <div className="war-room">
      <section className={`war-sync is-${overall}`} aria-label="資料同步狀態">
        <span className="war-sync-dot" aria-hidden="true" />
        <div>
          <strong>
            {overall === "success" ? "資料已同步" : overall === "wait" ? "同步等待中" : "同步失敗"}
          </strong>
          <small>
            {sync ? `最後同步 ${syncClock(sync.updatedAt)}` : busy ? "讀取中" : "尚無資料"}
          </small>
        </div>
        <ul>
          <li>遊戲 {flagLabel(sync?.gameResults)}</li>
          <li>招生表 {flagLabel(sync?.recruitmentResponses)}</li>
          <li>總表 {flagLabel(sync?.recruitmentMaster)}</li>
        </ul>
      </section>
      {error ? (
        <p className="admin-error" role="alert">
          {error} · 戰情仍可操作，數字可能不完整
        </p>
      ) : null}

      <section className="war-kpis" aria-label="今日招生數字">
        <KpiCard
          id="today-contacts"
          label="今日接觸人數"
          value={summary?.playedToday ?? (busy ? "…" : 0)}
          hint="今天完成遊戲 · 去重"
          icon={<Gamepad2 size={22} />}
          details={
            <p>不含練習。同一人多局只算一次，姓名已正規化；電話不同的同名會分開計算。</p>
          }
        />
        <KpiCard
          id="all-contacts"
          label="累積接觸人數"
          value={summary?.playedAll ?? (busy ? "…" : 0)}
          hint="歷史正式遊戲"
          icon={<Users size={22} />}
          details={<p>所有日期的正式 60 秒挑戰，排除練習與重複局。</p>}
        />
        <KpiCard
          id="today-events"
          label="今日活動報名人數"
          value={summary?.activityToday ?? "—"}
          hint="今天報名至少一場"
          icon={<CalendarCheck size={22} />}
          tone={summary?.activityToday ? "ok" : "plain"}
          details={<p>同一人報多場仍算 1 人。不含「無／考慮中」。</p>}
        />
        <KpiCard
          id="joined"
          label="入社人數"
          value={summary?.joined ?? "—"}
          hint="正式表單「是」"
          icon={<UserPlus size={22} />}
          details={<p>以招生狀況表「是否入社」計算，同名同電話只算一次。</p>}
        />
        <KpiCard
          id="deposit"
          label="已繳保證金"
          value={summary?.depositPaid ?? "—"}
          hint="正式表單「是」"
          icon={<Coins size={22} />}
          details={<p>以招生狀況表「保證金是否繳費」計算，不去猜遊戲分數。</p>}
        />
        <KpiCard
          id="pending"
          label="待填正式招生資料"
          value={pending}
          hint="玩過遊戲尚未填表"
          icon={<ClipboardList size={22} />}
          tone={pending ? "warn" : "ok"}
          details={
            <div className="war-pending-cta">
              <p>{summary?.conflicts ? `${summary.conflicts} 筆姓名需現場確認，不會自動合併。` : "下一步先處理尚未填正式招生資料的有緣人。"}</p>
              <button type="button" className="admin-primary" onClick={onOpenPending}>
                去待處理
              </button>
            </div>
          }
        />
      </section>

      <section className="admin-panel war-funnel" aria-label="招生漏斗">
        <h2>遊戲接觸 → 活動報名 → 入社 → 保證金</h2>
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
      </section>

      <section className="admin-panel war-events" aria-label="各活動報名人數">
        <h2>
          <Ticket size={18} aria-hidden="true" /> 各活動報名人數
        </h2>
        {!events.length ? (
          <p className="admin-empty">尚無活動選項</p>
        ) : (
          <div className="war-event-bars">
            {events.map((row) => (
              <button
                key={row.name}
                type="button"
                aria-pressed={openEvent === row.name}
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
          <p className="admin-caption">
            {openEvent}：同一人只算一次。
            <button type="button" className="recruitment-name" onClick={onOpenRoster}>
              到名單篩選
            </button>
          </p>
        ) : null}
      </section>

      <section className="admin-panel war-trend" aria-label="近七日接觸、報名、入社">
        <h2>近七日走勢</h2>
        <p className="admin-caption">接＝接觸 · 報＝活動報名 · 社＝入社</p>
        <div className="war-trend-chart">
          {trend.map((row) => (
            <div key={row.date} className="war-trend-day">
              <div className="war-trend-cols">
                <span style={{ height: `${(row.contacts / maxTrend) * 100}%` }} title={`接觸 ${row.contacts}`}>
                  <b>接</b>
                </span>
                <span className="is-signup" style={{ height: `${(row.signups / maxTrend) * 100}%` }} title={`報名 ${row.signups}`}>
                  <b>報</b>
                </span>
                <span className="is-joined" style={{ height: `${(row.joined / maxTrend) * 100}%` }} title={`入社 ${row.joined}`}>
                  <b>社</b>
                </span>
              </div>
              <small>{row.date.slice(5)}</small>
            </div>
          ))}
        </div>
      </section>

      {summary?.conflicts ? (
        <p className="admin-caption war-conflict">
          <CircleAlert size={16} aria-hidden="true" /> {summary.conflicts} 筆同名資料需確認，不會自動合併。
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

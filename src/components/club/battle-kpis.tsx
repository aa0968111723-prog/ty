import { useId, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  RefreshCw,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
type CommandData = {
  summary: {
    contactsToday?: number;
    contactsTotal?: number;
    playedToday: number;
    pending: number;
    pendingFormal?: number;
    activityToday?: number | null;
    activity: number | null;
    joined: number | null;
    depositPaid: number | null;
    depositTotal: number | null;
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
  sync: {
    gameResults: { ok: boolean; stale?: boolean };
    recruitmentResponses: { ok: boolean; stale?: boolean };
    recruitmentMaster: { ok: boolean; stale?: boolean };
  };
};

function metric(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("zh-Hant");
}

function syncState(flag?: { ok?: boolean; stale?: boolean }) {
  if (!flag) return "尚未讀取";
  if (flag.ok) return "正常";
  if (flag.stale) return "顯示上次資料";
  return "同步失敗";
}

function Ring({
  value,
  max,
  label,
  tone = "brand",
}: {
  value: number | null | undefined;
  max: number;
  label: string;
  tone?: "brand" | "highlight" | "ink";
}) {
  const id = useId();
  const numeric = typeof value === "number" ? value : 0;
  const pct = max > 0 ? Math.max(0, Math.min(100, (numeric / max) * 100)) : 0;
  const dash = `${pct} ${100 - pct}`;
  return (
    <svg className={`battle-ring is-${tone}`} viewBox="0 0 36 36" role="img" aria-label={label}>
      <title>{label}</title>
      <circle className="battle-ring-track" cx="18" cy="18" r="15.915" fill="none" strokeWidth="3" />
      <circle
        className="battle-ring-value"
        cx="18"
        cy="18"
        r="15.915"
        fill="none"
        strokeWidth="3"
        strokeDasharray={dash}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text id={id} x="18" y="21" textAnchor="middle">
        {value == null ? "—" : numeric}
      </text>
    </svg>
  );
}

function ExpandCard({
  id,
  icon: Icon,
  label,
  value,
  hint,
  details,
  defaultOpen = false,
}: {
  id: string;
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  details: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article className={`battle-kpi${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="battle-kpi-toggle"
        aria-expanded={open}
        aria-controls={`${id}-detail`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="battle-kpi-icon" aria-hidden="true">
          <Icon size={22} />
        </span>
        <span>
          <small>{label}</small>
          <strong>{value}</strong>
          <em>{hint}</em>
        </span>
      </button>
      <div id={`${id}-detail`} hidden={!open} className="battle-kpi-detail">
        {details}
      </div>
    </article>
  );
}

export function BattleCommand({
  data,
  onOpenQueue,
  onOpenRoster,
}: {
  data: CommandData;
  onOpenQueue: () => void;
  onOpenRoster: () => void;
}) {
  const summary = data.summary;
  const maxActivity = Math.max(1, ...(data.activities || []).map((row) => row.count));
  const trendMax = Math.max(1, ...(data.dailyTrend || []).flatMap((row) => [row.contacts, row.activity, row.joined]));
  const funnelMax = Math.max(1, ...data.funnel.map((layer) => layer.count ?? 0));
  const contactsToday = summary.contactsToday ?? summary.playedToday;
  const contactsTotal = summary.contactsTotal ?? contactsToday;
  const pending = summary.pendingFormal ?? summary.pending;

  return (
    <div className="battle-command">
      <section className="battle-kpi-grid" aria-label="今日招生指標">
        <ExpandCard
          id="contacts-today"
          icon={Users}
          label="今日接觸"
          value={metric(contactsToday)}
          hint="正式遊戲 · 姓名正規化去重"
          details={
            <p>
              今天完成正式 60 秒挑戰的獨特人數。練習與試玩不計入。
              {contactsTotal != null ? ` 累積已接觸 ${metric(contactsTotal)} 人。` : ""}
            </p>
          }
        />
        <ExpandCard
          id="contacts-total"
          icon={TrendingUp}
          label="累積接觸"
          value={metric(contactsTotal)}
          hint="歷史正式遊戲去重"
          details={
            <div className="battle-progress" role="img" aria-label={`累積接觸 ${metric(contactsTotal)} 人`}>
              <span style={{ width: `${Math.min(100, ((contactsToday || 0) / Math.max(contactsTotal || 1, 1)) * 100)}%` }} />
              <small>今日佔累積 {contactsTotal ? Math.round(((contactsToday || 0) / contactsTotal) * 100) : 0}%</small>
            </div>
          }
        />
        <ExpandCard
          id="activity-today"
          icon={CalendarDays}
          label="今日活動報名"
          value={metric(summary.activityToday)}
          hint="一人多活動只計一次"
          details={<p>今天至少報名一項活動的人數。不含「無／考慮中」。</p>}
        />
        <ExpandCard
          id="pending"
          icon={ClipboardList}
          label="待填正式資料"
          value={metric(pending)}
          hint="已玩遊戲、尚未完成招生表"
          details={
            <button type="button" className="admin-primary" onClick={onOpenQueue}>
              查看待處理名單
            </button>
          }
        />
        <ExpandCard
          id="joined"
          icon={UserPlus}
          label="入社人數"
          value={metric(summary.joined)}
          hint="正式表單「是否入社」為是"
          details={<p>只計算正式招生資料裡勾選「是」的同學，不用遊戲分數推論。</p>}
        />
        <ExpandCard
          id="deposit"
          icon={CircleDollarSign}
          label="已繳保證金"
          value={metric(summary.depositPaid)}
          hint="正式表單「保證金」為是"
          details={<p>{summary.depositTotal != null ? `已登錄金額合計 ${metric(summary.depositTotal)}。` : "尚未讀到保證金金額欄。"}</p>}
        />
        <ExpandCard
          id="sync"
          icon={RefreshCw}
          label="資料同步狀態"
          value={
            data.sync.gameResults.ok && data.sync.recruitmentResponses.ok && data.sync.recruitmentMaster.ok
              ? "正常"
              : data.sync.gameResults.stale || data.sync.recruitmentResponses.stale || data.sync.recruitmentMaster.stale
                ? "等待重試"
                : "異常"
          }
          hint="遊戲／招生表／總表"
          details={
            <ul className="battle-sync-sources">
              <li>遊戲資料 {syncState(data.sync.gameResults)}</li>
              <li>招生狀況表 {syncState(data.sync.recruitmentResponses)}</li>
              <li>總表 {syncState(data.sync.recruitmentMaster)}</li>
            </ul>
          }
        />
      </section>

      <section className="admin-panel battle-rings" aria-label="接觸與入社完成度">
        <h2>一眼看懂</h2>
        <div className="battle-ring-row">
          <figure>
            <Ring
              value={contactsToday}
              max={Math.max(contactsTotal || 0, contactsToday || 0, 1)}
              label={`今日接觸 ${metric(contactsToday)} 人`}
            />
            <figcaption>今日接觸</figcaption>
          </figure>
          <figure>
            <Ring
              value={summary.activity}
              max={Math.max(contactsTotal || 0, summary.activity || 0, 1)}
              label={`活動報名 ${metric(summary.activity)} 人`}
              tone="highlight"
            />
            <figcaption>活動報名</figcaption>
          </figure>
          <figure>
            <Ring
              value={summary.joined}
              max={Math.max(contactsTotal || 0, summary.joined || 0, 1)}
              label={`入社 ${metric(summary.joined)} 人`}
              tone="ink"
            />
            <figcaption>入社</figcaption>
          </figure>
        </div>
      </section>

      <section className="admin-panel battle-funnel" aria-label="招生漏斗">
        <h2>招生漏斗</h2>
        <ol>
          {data.funnel.map((layer) => {
            const width = layer.count == null ? 12 : Math.max(12, (layer.count / funnelMax) * 100);
            return (
              <li key={layer.id}>
                <div className="battle-funnel-copy">
                  <strong>{layer.label}</strong>
                  <b>{layer.missing || layer.count == null ? "資料不足" : layer.count.toLocaleString("zh-Hant")}</b>
                </div>
                <div
                  className="battle-funnel-bar"
                  role="img"
                  aria-label={`${layer.label} ${layer.count == null ? "資料不足" : `${layer.count} 人`}`}
                >
                  <i style={{ width: `${width}%` }} />
                </div>
                <small>
                  {layer.fromPrevious == null
                    ? (layer.id === "played" ? "起點：正式遊戲接觸" : "資料不足")
                    : `上一階 ${layer.fromPrevious}%`}
                  {layer.fromStart != null ? ` · 整體 ${layer.fromStart}%` : ""}
                </small>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="admin-panel" aria-label="各活動報名">
        <div className="admin-section-heading">
          <h2><Ticket size={20} /> 各活動報名</h2>
          <button type="button" onClick={onOpenRoster}>看名單</button>
        </div>
        <div className="battle-activity-grid">
          {data.activities?.length ? data.activities.map((row) => (
            <article key={row.name}>
              <header>
                <strong>{row.name}</strong>
                <b>{row.count.toLocaleString("zh-Hant")}</b>
              </header>
              <div
                className="battle-bar"
                role="img"
                aria-label={`${row.name} ${row.count} 人，今日 ${row.today} 人`}
              >
                <i style={{ width: `${(row.count / maxActivity) * 100}%` }} />
              </div>
              <small>今日 {row.today}</small>
            </article>
          )) : <p className="admin-empty">尚無活動報名資料</p>}
        </div>
      </section>

      <section className="admin-panel" aria-label="近七日趨勢">
        <h2>近七日趨勢</h2>
        <p className="admin-caption">接觸／活動報名／入社 · 台灣時區</p>
        <div className="battle-trend" role="img" aria-label="近七日接觸、活動報名與入社人數">
          {data.dailyTrend?.map((row) => (
            <div key={row.date} className="battle-trend-day">
              <div
                className="battle-trend-cols"
                role="img"
                aria-label={`${row.date} 接觸 ${row.contacts}、報名 ${row.activity}、入社 ${row.joined}`}
              >
                <span style={{ height: `${(row.contacts / trendMax) * 100}%` }} aria-hidden="true" />
                <span style={{ height: `${(row.activity / trendMax) * 100}%` }} aria-hidden="true" />
                <span style={{ height: `${(row.joined / trendMax) * 100}%` }} aria-hidden="true" />
              </div>
              <small>
                {row.date.slice(5).replace("-", "/")}
                <span className="sr-only">
                  接觸 {row.contacts}、報名 {row.activity}、入社 {row.joined}
                </span>
              </small>
            </div>
          ))}
        </div>
        <ul className="battle-legend">
          <li><i className="is-contacts" /> 接觸</li>
          <li><i className="is-activity" /> 報名</li>
          <li><i className="is-joined" /> 入社</li>
        </ul>
      </section>
    </div>
  );
}

export function SyncPill({ data, error }: { data: CommandData | null; error?: string }) {
  if (!data) {
    return <span>{error ? "○ 同步失敗" : "尚未同步"}</span>;
  }
  const ok = data.sync.gameResults.ok
    && data.sync.recruitmentResponses.ok
    && data.sync.recruitmentMaster.ok
    && !error;
  const waiting = data.sync.gameResults.stale || data.sync.recruitmentResponses.stale || data.sync.recruitmentMaster.stale;
  return (
    <span>
      {ok ? "● 已連線" : waiting ? "○ 等待重試 · 顯示上次資料" : "○ 同步失敗 · 顯示已有資料"}
    </span>
  );
}

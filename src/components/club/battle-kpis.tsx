import { useId, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Star,
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
    popularActivity?: { name: string; count: number; today: number } | null;
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

function formatRate(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value}%`;
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
  const activities = id === "activity" || id === "popular";
  const completion = id === "joined" || id === "deposit";
  return (
    <article className={`battle-kpi${open ? " is-open" : ""}${id === "pending" ? " is-wide" : ""}${id === "popular" ? " is-text" : ""}${activities ? " is-activities" : ""}${completion ? " is-completion" : ""}`}>
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

function CompletionDetail({
  count,
  rate,
  rateLabel,
  missing,
  note,
  extra,
}: {
  count: number | null | undefined;
  rate: number | null | undefined;
  rateLabel: string;
  missing?: boolean;
  note: string;
  extra?: ReactNode;
}) {
  const people = missing || count == null ? "—" : metric(count);
  const pct = missing ? null : rate;
  return (
    <div className="battle-completion">
      <dl className="battle-completion-stats">
        <div>
          <dt>人數</dt>
          <dd>{people}</dd>
        </div>
        <div>
          <dt>完成比例</dt>
          <dd>{formatRate(pct)}</dd>
        </div>
      </dl>
      <div
        className="battle-progress"
        role="img"
        aria-label={`完成比例 ${formatRate(pct)} · ${rateLabel}`}
      >
        <span style={{ width: `${pct == null ? 0 : Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <small>{pct == null ? "資料不足時不會顯示成 0" : rateLabel}</small>
      <p>{note}</p>
      {extra}
    </div>
  );
}

function ActivityBreakdown({
  activities,
  popularName,
  missing,
}: {
  activities?: Array<{ name: string; count: number; today: number }>;
  popularName?: string;
  missing?: boolean;
}) {
  const rows = activities || [];
  if (!rows.length) {
    return <p>還沒有活動報名資料。資料不足時不會顯示成 0。</p>;
  }
  return (
    <ul className="battle-activity-breakdown" aria-label="各活動報名人數">
      {rows.map((row) => (
        <li key={row.name} className={row.name === popularName ? "is-popular" : undefined}>
          <span>{row.name}</span>
          <b>{missing ? "—" : metric(row.count)}</b>
          <small>今日 {missing ? "—" : metric(row.today)}</small>
        </li>
      ))}
    </ul>
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
  const popular = summary.popularActivity
    ?? (summary.activity == null
      ? null
      : (data.activities || [])
        .filter((row) => row.count > 0)
        .slice()
        .sort((a, b) => b.count - a.count || b.today - a.today || a.name.localeCompare(b.name, "zh-Hant"))[0] || null);
  const joinedLayer = data.funnel.find((layer) => layer.id === "joined");
  const depositLayer = data.funnel.find((layer) => layer.id === "deposit");

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
          id="activity"
          icon={CalendarDays}
          label="活動報名"
          value={metric(summary.activity)}
          hint={`今日 ${metric(summary.activityToday)} · 一人多活動只計一次`}
          details={
            <>
              <p>正式招生表至少報名一項活動的人數。不含「無／考慮中」。今日 {metric(summary.activityToday)} 人。</p>
              <ActivityBreakdown
                activities={data.activities}
                popularName={popular?.name}
                missing={summary.activity == null}
              />
            </>
          }
        />
        <ExpandCard
          id="popular"
          icon={Star}
          label="最受歡迎活動"
          value={popular?.name || "—"}
          hint={popular ? `${metric(popular.count)} 人` : "尚無正式報名"}
          details={
            <>
              {popular ? (
                <p>
                  正式招生表「報名了那個活動」人數最多。今日 {metric(popular.today)} 人。
                  不含「無／考慮中」，不用遊戲分數推論。
                </p>
              ) : (
                <p>還沒有活動報名資料。資料不足時不會顯示成 0。</p>
              )}
              <ActivityBreakdown
                activities={data.activities}
                popularName={popular?.name}
                missing={summary.activity == null}
              />
            </>
          }
        />
        <ExpandCard
          id="joined"
          icon={UserPlus}
          label="入社人數"
          value={metric(summary.joined)}
          hint="正式表單「是否入社」為是"
          details={
            <CompletionDetail
              count={summary.joined}
              rate={joinedLayer?.fromPrevious}
              rateLabel="佔活動報名"
              missing={joinedLayer?.missing || summary.joined == null}
              note="只計算正式招生資料裡勾選「是」的同學，不用遊戲分數推論。"
            />
          }
        />
        <ExpandCard
          id="deposit"
          icon={CircleDollarSign}
          label="已繳保證金"
          value={metric(summary.depositPaid)}
          hint="正式表單「保證金」為是"
          details={
            <CompletionDetail
              count={summary.depositPaid}
              rate={depositLayer?.fromPrevious}
              rateLabel="佔入社"
              missing={depositLayer?.missing || summary.depositPaid == null}
              note="只計算正式招生資料裡勾選「是」的同學，不用遊戲分數推論。"
              extra={
                <p>
                  {summary.depositTotal != null
                    ? `已登錄金額合計 ${metric(summary.depositTotal)}。`
                    : "尚未讀到保證金金額欄。"}
                </p>
              }
            />
          }
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
            <article key={row.name} className={popular?.name === row.name ? "is-popular" : undefined}>
              <header>
                <strong>{row.name}{popular?.name === row.name ? " · 最受歡迎" : ""}</strong>
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

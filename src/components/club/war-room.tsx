import { useState, type ReactNode } from "react";
import {
  Users,
  CalendarHeart,
  Sparkles,
  Landmark,
  Wallet,
  ClipboardList,
  Radio,
  ChevronDown,
} from "lucide-react";
import { time } from "./admin-presentation";
import type { RecruitmentData } from "./recruitment-dashboard";

function metric(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString();
}

function Ring({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  return (
    <svg className="war-ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} className="war-ring-track" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        className="war-ring-value"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="40" textAnchor="middle">{pct || 0}</text>
    </svg>
  );
}

function ExpandCard({
  id,
  icon: Icon,
  label,
  value,
  hint,
  tone,
  children,
  expanded,
  onToggle,
}: {
  id: string;
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  tone?: "focus" | "action" | "warn";
  children: ReactNode;
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  const open = expanded === id;
  return (
    <article className={`war-card${tone ? ` is-${tone}` : ""}`}>
      <button type="button" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className="war-card-icon">
          <Icon size={20} />
        </span>
        <span>
          <small>{label}</small>
          <strong>{value}</strong>
          <em>{hint}</em>
        </span>
        <ChevronDown size={18} className={open ? "is-open" : ""} />
      </button>
      {open ? <div className="war-card-detail">{children}</div> : null}
    </article>
  );
}

export function WarRoom({
  data,
  syncError,
  onOpenPending,
  onOpenRoster,
}: {
  data: RecruitmentData | null;
  syncError?: string;
  onOpenPending: () => void;
  onOpenRoster: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>("contacts");
  const summary = data?.summary;
  const activities = data?.activities ?? [];
  const daily = data?.daily ?? [];
  const funnel = data?.funnel ?? [];
  const pending = data?.pending ?? [];
  const popular = activities[0];
  const runnerUp = activities[1];
  const playedToday = summary?.playedToday ?? 0;
  const playedTotal = summary?.playedTotal ?? 0;
  const activityToday = summary?.activityToday ?? 0;
  const pendingCount = summary?.pending ?? 0;
  const priority = pending[0];
  const maxDaily = Math.max(1, ...daily.flatMap((row) => [row.contacts, row.activity, row.joined]));
  const syncOk = Boolean(
    data?.sync.gameResults.ok
      && data.sync.recruitmentResponses.ok
      && data.sync.recruitmentMaster.ok
      && !syncError,
  );

  function toggle(id: string) {
    setExpanded((current) => (current === id ? null : id));
  }

  return (
    <div className="war-room" data-war-room="home">
      <section className="war-hero" aria-label="今日接觸">
        <div>
          <p>一眼看懂今天</p>
          <strong>{metric(playedToday)}</strong>
          <span>今日接觸</span>
        </div>
        <Ring value={playedToday} max={Math.max(playedTotal, playedToday, 1)} />
        <small>累積 {metric(playedTotal)} 人 · 正式遊戲、姓名正規化去重、練習不計</small>
      </section>

      <section className="war-grid" aria-label="招生數字">
        <ExpandCard
          id="contacts"
          icon={Users}
          label="今日接觸"
          value={metric(playedToday)}
          hint={`累積 ${metric(playedTotal)}`}
          tone="focus"
          expanded={expanded}
          onToggle={toggle}
        >
          <p>當日完成正式 60 秒的人，同一人只算一次。練習模式不進正式統計。</p>
        </ExpandCard>
        <ExpandCard
          id="activity-today"
          icon={CalendarHeart}
          label="今日活動報名"
          value={metric(activityToday)}
          hint="人只計一次"
          expanded={expanded}
          onToggle={toggle}
        >
          <p>今天送出正式資料且報了實際活動的人數。選「無(考慮中」或「無(沒興趣」不算報名。</p>
        </ExpandCard>
        <ExpandCard
          id="joined"
          icon={Landmark}
          label="入社"
          value={summary?.joined == null ? "資料不足" : metric(summary.joined)}
          hint="正式招生表"
          expanded={expanded}
          onToggle={toggle}
        >
          <p>總表／招生狀況表裡勾「是否入社＝是」的人數。</p>
        </ExpandCard>
        <ExpandCard
          id="deposit"
          icon={Wallet}
          label="已繳保證金"
          value={summary?.depositPaid == null ? "資料不足" : metric(summary.depositPaid)}
          hint={summary?.depositTotal == null ? "金額資料不足" : `合計 ${metric(summary.depositTotal)}`}
          expanded={expanded}
          onToggle={toggle}
        >
          <p>已繳保證金的人數。金額僅供現場對帳，不會公開到前台。</p>
        </ExpandCard>
      </section>

      <section className="war-panel" aria-label="各活動報名">
        <div className="admin-section-heading">
          <h2><Sparkles size={18} /> 各活動報名</h2>
        </div>
        {!activities.length ? (
          <p className="admin-empty">還沒有人報名活動</p>
        ) : (
          <>
            {popular ? (
              <p className="war-popular">
                最受歡迎：<strong>{popular.name}</strong>
                <span>
                  {runnerUp
                    ? `目前 ${popular.count} 人，比 ${runnerUp.name} 多 ${popular.count - runnerUp.count} 人`
                    : `目前 ${popular.count} 人報名，是現在唯一有人報的場次`}
                </span>
              </p>
            ) : null}
            <ol className="war-activity-bars">
              {activities.map((row) => (
                <li key={row.name}>
                  <span>{row.name}</span>
                  <b style={{ width: `${Math.max(12, (row.count / Math.max(popular?.count || 1, 1)) * 100)}%` }}>
                    {row.count}
                  </b>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="war-panel" aria-label="招生漏斗">
        <h2>從接觸到保證金</h2>
        <ol className="war-funnel">
          {funnel.map((layer, index) => (
            <li key={layer.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{layer.label}</strong>
                <b>{layer.missing || layer.count == null ? "資料不足" : layer.count}</b>
                <small>
                  {layer.fromStart == null ? "—" : `佔接觸 ${layer.fromStart}%`}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="war-panel" aria-label="每日趨勢">
        <h2>近七日</h2>
        <p className="admin-caption">接觸 · 活動報名 · 入社</p>
        {!daily.length ? (
          <p className="admin-empty">還不能畫趨勢</p>
        ) : (
          <div className="war-trend" role="img" aria-label="近七日接觸、報名、入社">
            {daily.map((row) => (
              <div key={row.date}>
                <div className="war-trend-cols">
                  <i style={{ height: `${(row.contacts / maxDaily) * 72}px` }} title={`接觸 ${row.contacts}`} />
                  <i className="is-activity" style={{ height: `${(row.activity / maxDaily) * 72}px` }} title={`報名 ${row.activity}`} />
                  <i className="is-joined" style={{ height: `${(row.joined / maxDaily) * 72}px` }} title={`入社 ${row.joined}`} />
                </div>
                <small>{row.date.slice(5).replace("-", "/")}</small>
              </div>
            ))}
          </div>
        )}
        <ul className="war-legend">
          <li>接觸</li>
          <li>報名</li>
          <li>入社</li>
        </ul>
      </section>

      <button type="button" className="war-priority" onClick={onOpenPending}>
        <ClipboardList size={22} />
        <span>
          <small>待填正式資料 · {metric(pendingCount)} 位</small>
          <strong>
            {priority
              ? `現在先找 ${priority.name}`
              : pendingCount
                ? "打開待處理名單"
                : "目前沒有待填的人"}
          </strong>
          {priority ? (
            <em>
              已等 {priority.waitMinutes ?? "—"} 分 · 遊戲關主 {priority.gameGatekeeper || "未填"}
            </em>
          ) : null}
        </span>
      </button>

      <div className="war-sync" role="status">
        <Radio size={18} />
        <div>
          <strong>{syncOk ? "資料已同步" : "同步異常，顯示上次成功資料"}</strong>
          <span>最後同步 {data ? time(data.sync.updatedAt) : "—"} · Asia/Taipei</span>
        </div>
        <button type="button" onClick={onOpenRoster}>看名單</button>
      </div>
    </div>
  );
}

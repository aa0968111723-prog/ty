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
    <article className={`war-card${tone ? ` is-${tone}` : ""}`} data-war-metric={id}>
      <button type="button" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className="war-card-icon">
          <Icon size={20} />
        </span>
        <span className="war-card-copy">
          <small className="war-card-label">{label}</small>
          <strong>{value}</strong>
          <em className="war-card-hint">{hint}</em>
        </span>
        <ChevronDown size={18} className={open ? "is-open" : ""} />
      </button>
      {open ? <div className="war-card-detail">{children}</div> : null}
    </article>
  );
}

const SHELL_CARDS = [
  { id: "contacts", icon: Users, label: "接觸", hint: "累積 —" },
  { id: "activity-today", icon: CalendarHeart, label: "活動", hint: "報名" },
  { id: "joined", icon: Landmark, label: "入社", hint: "招生表" },
  { id: "deposit", icon: Wallet, label: "保證金", hint: "—" },
] as const;

export function WarRoom({
  data,
  syncError,
  lastSyncAt,
  onRetry,
  onOpenPending,
  onOpenRoster,
}: {
  data: RecruitmentData | null;
  syncError?: string;
  lastSyncAt?: string;
  onRetry?: () => void;
  onOpenPending: () => void;
  onOpenRoster: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  function toggle(id: string) {
    setExpanded((current) => (current === id ? null : id));
  }
  if (!data) {
    const waiting = !syncError;
    return (
      <div className="war-room" data-war-room="home" data-war-state={waiting ? "loading" : "error"}>
        <section className="war-hero" aria-label="今日接觸">
          <div>
            <p>一眼看懂今天</p>
            <strong>—</strong>
            <span>今日接觸</span>
          </div>
          <Ring value={0} max={1} />
          <small>{waiting ? "正在載入今日戰情…" : "招生資料同步失敗，戰情殼仍可操作。"}</small>
        </section>
        <section className="war-grid" aria-label="招生數字">
          {SHELL_CARDS.map((card) => (
            <ExpandCard
              key={card.id}
              id={card.id}
              icon={card.icon}
              label={card.label}
              value="—"
              hint={card.hint}
              expanded={expanded}
              onToggle={toggle}
            >
              <p>{waiting ? "資料同步完成後會顯示人數。" : "同步失敗，數字暫缺。請再試一次。"}</p>
            </ExpandCard>
          ))}
        </section>
        <div className="war-sync" role="status" data-sync-state={waiting ? "wait" : "fail"}>
          <Radio size={18} />
          <div>
            <strong>{waiting ? "等待" : "失敗"}</strong>
            <span>最後同步 {time(lastSyncAt || "")} · Asia/Taipei</span>
          </div>
          {onRetry ? (
            <button type="button" data-sync-retry onClick={onRetry}>
              再試一次
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const summary = data.summary;
  const activities = data.activities ?? [];
  const daily = data.daily ?? [];
  const funnel = data.funnel ?? [];
  const pending = data.pending ?? [];
  const popular = activities[0];
  const runnerUp = activities[1];
  const playedToday = summary?.playedToday ?? 0;
  const playedTotal = summary?.playedTotal ?? 0;
  const activityToday = summary?.activityToday ?? 0;
  const pendingCount = summary?.pending ?? 0;
  const priority = pending[0];
  const maxDaily = Math.max(1, ...daily.flatMap((row) => [row.contacts, row.activity, row.joined]));
  const syncOk = Boolean(
    data.sync.gameResults.ok
      && data.sync.recruitmentResponses.ok
      && data.sync.recruitmentMaster.ok
      && !syncError,
  );

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
          label="接觸"
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
          label="活動"
          value={metric(activityToday)}
          hint="報名"
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
          hint="招生表"
          expanded={expanded}
          onToggle={toggle}
        >
          <p>總表／招生狀況表裡勾「是否入社＝是」的人數。</p>
        </ExpandCard>
        <ExpandCard
          id="deposit"
          icon={Wallet}
          label="保證金"
          value={summary?.depositPaid == null ? "資料不足" : metric(summary.depositPaid)}
          hint={
            summary?.depositNeedsReview
              ? "需確認"
              : summary?.depositTotal == null ? "無金額" : `$${metric(summary.depositTotal)}`
          }
          tone={summary?.depositNeedsReview ? "warn" : undefined}
          expanded={expanded}
          onToggle={toggle}
        >
          <p>
            {summary?.depositNeedsReview
              ? "已繳人數依正式表單「保證金＝是」，用姓名＋電話去重。同名不同號或同號不同名會分開算並標需確認，不會用遊戲分數或只靠電話合併。"
              : "已繳保證金的人數。保證金以正式表單勾選為準。金額僅供現場對帳，不會公開到前台。"}
          </p>
          {summary?.depositNeedsReview && summary?.depositTotal != null ? (
            <p>對帳金額 ${metric(summary.depositTotal)}。</p>
          ) : null}
        </ExpandCard>
      </section>
      <p className="admin-caption">
        {summary?.depositNeedsReview
          ? "有姓名或電話重複，保證金人數需確認。以正式表單勾選為準，與是否入社分開計算。"
          : "保證金以正式表單勾選為準，與是否入社分開計算。"}
      </p>

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

      <div className="war-sync" role="status" data-sync-state={syncOk ? "ok" : "fail"}>
        <Radio size={18} />
        <div>
          <strong>{syncOk ? "成功" : "失敗"}</strong>
          <span>
            最後同步 {time(lastSyncAt || data.sync.updatedAt)} · Asia/Taipei
            {syncOk ? "" : " · 顯示上次成功資料"}
          </span>
        </div>
        {syncOk || !onRetry ? (
          <button type="button" onClick={onOpenRoster}>看名單</button>
        ) : (
          <button type="button" data-sync-retry onClick={onRetry}>再試一次</button>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarCheck,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Users,
  UserPlus,
} from "lucide-react";
import type { RecruitmentData } from "./recruitment-dashboard";

function metric(value: number | null | undefined) {
  if (value == null) return "資料不足";
  return value.toLocaleString();
}

function syncLabel(data: RecruitmentData, error?: string) {
  const flags = [
    data.sync.gameResults,
    data.sync.recruitmentResponses,
    data.sync.recruitmentMaster,
    data.sync.form,
  ];
  if (error) return { tone: "fail" as const, text: "同步失敗，仍顯示上次資料" };
  if (flags.every((flag) => flag.ok)) return { tone: "ok" as const, text: "同步正常" };
  if (flags.some((flag) => flag.stale)) return { tone: "wait" as const, text: "等待同步 · 顯示上次資料" };
  return { tone: "fail" as const, text: "同步失敗，仍顯示上次資料" };
}

function clock(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Ring({ value, max, label }: { value: number; max: number; label: string }) {
  const safeMax = Math.max(max, value, 1);
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
  return (
    <span className="battle-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle className="battle-ring-track" cx="18" cy="18" r="15" />
        <circle
          className="battle-ring-fill"
          cx="18"
          cy="18"
          r="15"
          strokeDasharray={`${pct} 100`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="battle-ring-icon">{label}</span>
    </span>
  );
}

export function BattleHome({
  data,
  error,
  busy,
  onOpenPending,
  onOpenRoster,
}: {
  data: RecruitmentData;
  error?: string;
  busy?: boolean;
  onOpenPending: () => void;
  onOpenRoster: () => void;
}) {
  const [open, setOpen] = useState<string | null>("events");
  const sync = syncLabel(data, error);
  const events = data.events || [];
  const daily = data.daily || [];
  const maxContact = Math.max(1, ...daily.map((row) => row.contacts));
  const maxSignup = Math.max(1, ...daily.map((row) => row.signups));
  const maxJoin = Math.max(1, ...daily.map((row) => row.joins));
  const maxEvent = Math.max(1, ...events.map((row) => row.count), 1);
  const funnelMax = Math.max(1, ...data.funnel.map((layer) => layer.count || 0));
  const cards = useMemo(
    () => [
      {
        id: "today",
        label: "今日接觸",
        value: data.summary.contactsToday ?? data.summary.playedToday,
        hint: "今天完成正式遊戲的人數，已去重",
        icon: "人",
        Icon: Users,
      },
      {
        id: "all",
        label: "累計接觸",
        value: data.summary.contactsCumulative ?? data.summary.playedToday,
        hint: "歷史正式遊戲人數，不含練習",
        icon: "累",
        Icon: Users,
      },
      {
        id: "events",
        label: "今日活動報名",
        value: data.summary.eventSignupsToday,
        hint: "今天至少報名一個活動的人數，一人只算一次",
        icon: "活",
        Icon: CalendarCheck,
      },
      {
        id: "joined",
        label: "入社",
        value: data.summary.joined,
        hint: "正式表單「是否入社」為是",
        icon: "社",
        Icon: UserPlus,
      },
      {
        id: "deposit",
        label: "保證金",
        value: data.summary.depositPaid,
        hint: "正式表單「保證金」為是",
        icon: "金",
        Icon: Banknote,
      },
      {
        id: "pending",
        label: "待填正式表單",
        value: data.summary.pendingOfficialForm ?? data.summary.pending,
        hint: "已玩遊戲、尚未填正式招生表單",
        icon: "待",
        Icon: ClipboardList,
      },
    ],
    [data],
  );

  return (
    <div className="battle-home">
      <section className="battle-kpis" aria-label="今日招生數字">
        {cards.map((card) => {
          const Icon = card.Icon;
          const expanded = open === card.id;
          return (
            <article key={card.id} className={`battle-kpi${expanded ? " is-open" : ""}`}>
              <button
                type="button"
                data-battle-kpi={card.id}
                aria-expanded={expanded}
                onClick={() => {
                  setOpen(expanded ? null : card.id);
                }}
              >
                <Ring value={typeof card.value === "number" ? card.value : 0} max={funnelMax} label={card.icon} />
                <span>
                  <small>{card.label}</small>
                  <strong>{metric(card.value)}</strong>
                </span>
                <Icon size={18} aria-hidden="true" />
                <ChevronDown size={16} className={expanded ? "is-open" : ""} aria-hidden="true" />
              </button>
              {expanded ? <p className="battle-kpi-note">{card.hint}</p> : null}
            </article>
          );
        })}
      </section>

      <div className="battle-next">
        <button type="button" className="admin-primary" onClick={onOpenPending}>
          處理下一位同學
        </button>
        <button type="button" onClick={onOpenRoster}>
          查看名單
        </button>
        <p className="admin-caption">
          {data.summary.pendingOfficialForm
            ? `還有 ${data.summary.pendingOfficialForm} 位尚未填正式表單`
            : "目前沒有待填正式表單的同學"}
        </p>
      </div>

      <section className={`battle-sync is-${sync.tone}`} aria-live="polite">
        <CircleAlert size={18} aria-hidden="true" />
        <div>
          <strong>{sync.text}</strong>
          <p>最後同步 {clock(data.sync.updatedAt)}{busy ? " · 更新中" : ""}</p>
        </div>
      </section>

      <section className="admin-panel battle-funnel" aria-label="招生漏斗">
        <h2>遊戲接觸 → 活動報名 → 入社 → 保證金</h2>
        <ol>
          {data.funnel.map((layer) => {
            const width = layer.count == null ? 12 : Math.max(12, Math.round((layer.count / funnelMax) * 100));
            return (
              <li key={layer.id}>
                <div>
                  <strong>{layer.label}</strong>
                  <b>{layer.missing || layer.count == null ? "資料不足" : layer.count.toLocaleString()}</b>
                </div>
                <span className="battle-funnel-track" aria-hidden="true">
                  <i style={{ width: `${width}%` }} />
                </span>
                <small>
                  {layer.fromPrevious == null
                    ? layer.id === "played"
                      ? "起點 · 歷史正式遊戲人數"
                      : "資料不足"
                    : `上一階 ${layer.fromPrevious}%`}
                </small>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="admin-panel" aria-label="熱門活動">
        <h2>熱門活動</h2>
        <p className="admin-caption">依正式表單既有活動選項計算，同一人同一活動只算一次。</p>
        <div className="battle-event-bars">
          {events.map((row) => (
            <button
              key={row.id}
              type="button"
              data-event={row.id}
              aria-pressed={open === `event:${row.id}`}
              onClick={() => {
                setOpen(open === `event:${row.id}` ? "events" : `event:${row.id}`);
              }}
            >
              <span>{row.label}</span>
              <span className="admin-bar-track">
                <i style={{ width: `${Math.round((row.count / maxEvent) * 100)}%` }} />
              </span>
              <strong>{row.count}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel" aria-label="每日接觸與報名">
        <h2>近七日</h2>
        <p className="admin-caption">實線接觸 · 虛線報名 · 點線入社。數字為去重人數。</p>
        <div className="battle-daily">
          {daily.map((row) => (
            <div key={row.date}>
              <span className="battle-daily-date">{row.date.slice(5)}</span>
              <span className="battle-daily-col" aria-label={`${row.date} 接觸 ${row.contacts}`}>
                <i className="is-contact" style={{ height: `${Math.round((row.contacts / maxContact) * 100)}%` }} />
              </span>
              <span className="battle-daily-col" aria-label={`${row.date} 報名 ${row.signups}`}>
                <i className="is-signup" style={{ height: `${Math.round((row.signups / maxSignup) * 100)}%` }} />
              </span>
              <span className="battle-daily-col" aria-label={`${row.date} 入社 ${row.joins}`}>
                <i className="is-join" style={{ height: `${Math.round((row.joins / maxJoin) * 100)}%` }} />
              </span>
            </div>
          ))}
        </div>
        <ul className="battle-legend">
          <li><span className="is-contact" /> 接觸</li>
          <li><span className="is-signup" /> 活動報名</li>
          <li><span className="is-join" /> 入社</li>
        </ul>
      </section>
    </div>
  );
}

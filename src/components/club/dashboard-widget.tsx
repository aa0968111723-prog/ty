import { type ReactNode } from "react";
import { Medal, Sheet, Trophy, PinOff, Pin, X, Check, GripVertical } from "lucide-react";
import { WIDGETS, time, taipeiDate, type WidgetId, type Dashboard, type LayoutPreference } from "./admin-presentation";
import { Kpi, Bars, Podium } from "./admin-metrics";

export function DashboardWidget({ id, editor = false, data, todayData, date, layout, dragging, setDragging, togglePinned, toggleVisible, moveWidget, selectLeader }: {
 id: WidgetId; editor?: boolean; data: Dashboard | null; todayData: Dashboard | null; date: string;
 layout: LayoutPreference; dragging: WidgetId | null; setDragging: (id: WidgetId | null) => void;
 togglePinned: (id: WidgetId) => void; toggleVisible: (id: WidgetId) => void;
 moveWidget: (from: WidgetId, to: WidgetId) => void; selectLeader: (name: string) => void;
}) {
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
        onDragEnd={() => setDragging(null)}
        onDragStart={() => setDragging(id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => {
          if (editor && dragging) moveWidget(dragging, id);
          setDragging(null);
        }}
      >
        {editor && (
          <div className="admin-widget-tools">
            <span className="admin-editor-item-label">
              {WIDGETS.find((item) => item.id === id)?.label}
            </span>
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
            <button
              type="button"
              className="admin-drag-handle"
              aria-label={`向前移動${WIDGETS.find((item) => item.id === id)?.label}`}
              disabled={layout.order.indexOf(id) === 0}
              onClick={() => moveWidget(id, layout.order[layout.order.indexOf(id) - 1])}
            >
              <GripVertical size={20} />
            </button>
          </div>
        )}
        {body}
        {editor && !layout.visible.includes(id) && (
          <span className="admin-hidden-label">已隱藏</span>
        )}
      </article>
    );
  }

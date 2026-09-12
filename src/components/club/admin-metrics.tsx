import { type Count, type Result } from "./admin-presentation";

export function Bars({ rows, onSelect }: { rows: Count[]; onSelect?: (name: string) => void }) {
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
export function Podium({ rows, compact = false }: { rows: Result[]; compact?: boolean }) {
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
export function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="admin-widget-kpi">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

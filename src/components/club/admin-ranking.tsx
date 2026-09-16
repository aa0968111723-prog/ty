import { useEffect, useState } from "react";
import type { PublicLeaderboard, LeaderboardScope } from "./leaderboard-board";

export function AdminPublicRanking({ scope }: { scope: LeaderboardScope }) {
  const [data, setData] = useState<PublicLeaderboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    fetch(`/api/leaderboard?scope=${scope}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("排行榜暫時無法讀取");
        const body = await response.json();
        if (!body?.ok || !Array.isArray(body.rows)) throw new Error("排行榜暫時無法讀取");
        setData(body);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "排行榜暫時無法讀取");
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [scope]);

  return (
    <section className="admin-panel" aria-label={scope === "today" ? "今日排行榜" : "歷史排行榜"}>
      <h2>{scope === "today" ? "今日排行榜" : "歷史排行榜"}</h2>
      <p className="admin-caption">只顯示遊戲排名 · 不含電話、科系或招生資料</p>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      {busy ? <p className="admin-empty">讀取排行榜…</p> : null}
      {!busy && !error && !data?.rows.length ? <p className="admin-empty">尚無正式挑戰紀錄</p> : null}
      <ol className="admin-podium">
        {(data?.rows || []).map((row) => (
          <li key={`${row.rank}-${row.displayName}`}>
            <span className={`admin-medal medal-${Math.min(row.rank, 3) - 1}`}>{row.rank}</span>
            <div>
              <strong>{row.displayName}</strong>
              <small>{row.title} · 正確率 {row.accuracy}% · {row.time}</small>
            </div>
            <b>{row.score.toLocaleString("zh-Hant")}</b>
          </li>
        ))}
      </ol>
      <p className="admin-caption">
        <a href={`/leaderboard?scope=${scope}`}>開啟公開排行榜頁</a>
      </p>
    </section>
  );
}

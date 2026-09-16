import { useEffect, useState } from "react";
import type { PublicLeaderboard, PublicLeaderboardRow } from "./leaderboard-board";

export function AdminRankBoard({ scope }: { scope: "today" | "history" }) {
  const [data, setData] = useState<PublicLeaderboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/leaderboard?scope=${scope}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        if (!body?.ok || !Array.isArray(body.rows)) throw new Error("排行榜讀取失敗");
        setData(body);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("排行榜暫時無法顯示");
      });
    return () => controller.abort();
  }, [scope]);
  const rows: PublicLeaderboardRow[] = data?.rows || [];
  return (
    <section className="admin-panel" aria-label={scope === "today" ? "今日排行榜" : "歷史排行榜"}>
      <h2>{scope === "today" ? "今日排行榜" : "歷史排行榜"}</h2>
      <p className="admin-caption">只顯示遊戲名次與分數，不含電話與招生資料</p>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      {!rows.length ? (
        <p className="admin-empty">{error ? "排行榜讀取失敗" : "尚無正式挑戰紀錄"}</p>
      ) : (
        <ol className="admin-rank-list">
          {rows.map((row) => (
            <li key={`${row.rank}-${row.displayName}`}>
              <span>{row.rank}</span>
              <div>
                <strong>{row.displayName}</strong>
                <small>{row.title} · {row.accuracy}% · {row.time}</small>
              </div>
              <b>{row.score.toLocaleString()}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

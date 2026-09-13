import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ClubHeader } from "./club-header";
import { BrandLogo } from "./brand-logo";
import { resultTitle, TEXT, type Language } from "./presentation";

export type LeaderboardScope = "today" | "history";
export type PublicLeaderboardRow = {
  rank: number;
  displayName: string;
  score: number;
  accuracy: number;
  title: string;
  time: string;
};
export type PublicLeaderboard = {
  ok: true;
  public: true;
  scope: LeaderboardScope;
  date: string;
  rows: PublicLeaderboardRow[];
  topThree: PublicLeaderboardRow[];
  count?: number;
  generatedAt?: string;
};

function medalClass(rank: number) {
  if (rank === 1) return "podium-1";
  if (rank === 2) return "podium-2";
  return "podium-3";
}

export function LeaderboardBoard({
  language,
  onLanguage,
  initialScope = "today",
  initialData = null,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  initialScope?: LeaderboardScope;
  initialData?: PublicLeaderboard | null;
}) {
  const ui = TEXT[language];
  const zh = language === "zh";
  const [scope, setScope] = useState<LeaderboardScope>(initialScope);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<PublicLeaderboard | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    if (!data || data.scope !== scope) setLoading(true);
    setError(false);
    try {
      window.history.replaceState(null, "", `/leaderboard?scope=${scope}`);
    } catch {
      /* ignore */
    }
    fetch(`/api/leaderboard?scope=${scope}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("leaderboard");
        const body = await res.json();
        if (!body?.ok || !Array.isArray(body.rows)) throw new Error("leaderboard");
        setData(body);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setError(true);
        setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [scope, reload]);

  const rows = data?.rows ?? [];
  const topThree = (data?.topThree ?? rows.slice(0, 3)).slice(0, 3);

  return (
    <div className="leaderboard-page" data-leaderboard-page>
      <ClubHeader language={language} onLanguage={onLanguage} active="leaderboard" />
      <main className="leaderboard-body">
        <p className="eyebrow">{zh ? "淡江禪學社 · 115-1 社團博覽會" : "TKU Zen Club · Club Expo"}</p>
        <h1>{ui.leaderboard}</h1>
        <p className="leaderboard-intro">{ui.leaderboardIntro}</p>
        <div className="leaderboard-scope" role="tablist" aria-label={ui.leaderboard}>
          {(["today", "history"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              className={scope === id ? "is-active" : ""}
              data-scope={id}
              onClick={() => setScope(id)}
            >
              {id === "today" ? ui.leaderboardToday : ui.leaderboardHistory}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="leaderboard-status" data-leaderboard-state="loading">
            {ui.leaderboardLoading}
          </p>
        ) : null}
        {error ? (
          <div className="leaderboard-status" data-leaderboard-state="error">
            <p>{ui.leaderboardError}</p>
            <button type="button" className="cta" onClick={() => setReload((value) => value + 1)}>
              <RefreshCw size={16} aria-hidden="true" />
              {ui.leaderboardRetry}
            </button>
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="leaderboard-status" data-leaderboard-state="empty">
            <BrandLogo size={88} />
            <p>{scope === "today" ? ui.leaderboardEmptyToday : ui.leaderboardEmptyHistory}</p>
          </div>
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <>
            <ol className="leaderboard-podium" data-leaderboard-podium>
              {topThree.map((row) => (
                <li key={`podium-${row.rank}`} className={medalClass(row.rank)} data-rank={row.rank}>
                  <span className="podium-medal">{row.rank}</span>
                  <strong>{row.displayName}</strong>
                  <b>{row.score.toLocaleString()}</b>
                  <small>
                    {resultTitle(row.title, language)} · {ui.accuracyShort} {row.accuracy}%
                  </small>
                  <time>{row.time}</time>
                </li>
              ))}
            </ol>
            <ol className="leaderboard-list" data-leaderboard-list>
              {rows.map((row) => (
                <li key={`row-${row.rank}`}>
                  <span>{row.rank}</span>
                  <div>
                    <strong>{row.displayName}</strong>
                    <small>
                      {resultTitle(row.title, language)} · {row.accuracy}% · {row.time}
                    </small>
                  </div>
                  <b>{row.score.toLocaleString()}</b>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {data?.date ? (
          <p className="leaderboard-date">
            {zh ? "統計日期" : "Board date"} {data.date}
            {zh ? "（台北時間）" : " (Asia/Taipei)"}
          </p>
        ) : null}
        <a className="cta secondary" href="/">
          {ui.leaderboardPlay}
        </a>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { remainingSeconds, tickGame, type LiveGame } from "@/lib/club/runtime.mjs";

export function ScoreHUD({
  game,
  language,
  score,
  combo,
  onExpire,
}: {
  game: LiveGame;
  language: "zh" | "en";
  score: number;
  combo: number;
  onExpire: () => void;
}) {
  const [seconds, setSeconds] = useState(() =>
    Math.ceil(remainingSeconds(game, performance.now())),
  );
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    let displayed = -1;
    const update = () => {
      const tick = tickGame(game, performance.now());
      const next = Math.ceil(tick.remaining);
      if (displayed !== next) {
        displayed = next;
        setSeconds(next);
      }
      if (railRef.current) {
        railRef.current.style.transform = `scaleX(${Math.max(0, tick.remaining / game.duration)})`;
      }
      if (tick.expired) {
        onExpire();
        return;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [game, onExpire]);

  return (
    <div className="score-hud">
      <div className="game-top">
        <div
          className={"time-board" + (seconds <= 10 ? " warn" : "")}
          role="timer"
          aria-label={language === "zh" ? "剩餘秒數" : "Time left"}
        >
          <span>{language === "zh" ? "剩餘秒數" : "Time left"}</span>
          <strong data-time>{seconds}</strong>
        </div>
        <div className="game-stats">
          <div>
            <span>{language === "zh" ? "分數" : "Score"}</span>
            <strong data-score>{score}</strong>
          </div>
          <div>
            <span>{language === "zh" ? "連擊" : "Combo"}</span>
            <strong data-combo>×{combo}</strong>
          </div>
        </div>
      </div>
      <div className={"time-rail" + (seconds <= 10 ? " is-warn" : "")} aria-hidden="true">
        <i ref={railRef} />
      </div>
    </div>
  );
}

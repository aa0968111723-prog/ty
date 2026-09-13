import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TurtleMood } from "@/components/turtle";
import { ScoreHUD } from "@/components/club/score-hud";
import {
  clearPendingResult,
  readPendingResult,
  storePendingResult,
} from "@/lib/club/pending-result.mjs";
import {
  COLORS,
  DEFAULT_SETTINGS,
  correctId,
  createLiveGame,
  createWarmupGame,
  emptyPlayer,
  isOfficialSettings,
  judgeAnswer,
  publicResult,
  remainingSeconds,
  tickGame,
  validatePlayer,
} from "@/lib/club/runtime.mjs";

import { RegisterScreen } from "@/components/club/registration-form";
import { TutorialScreen } from "@/components/club/tutorial-screen";
import { ResultScreen } from "@/components/club/result-summary";
import { LanguageToggle } from "@/components/club/language-toggle";
import {
  TEXT,
  colorName,
  type Screen,
  type Language,
  type Player,
  type ColorId,
  type SaveKind,
  type GameSettings,
} from "@/components/club/presentation";

export const Route = createFileRoute("/")({
  ssr: false,
  component: BoothApp,
});

function BoothApp() {
  const [screen, setScreen] = useState<Screen>("register");
  const [language, setLanguage] = useState<Language>("zh");
  const [player, setPlayer] = useState<Player>(emptyPlayer);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<TurtleMood>("idle");
  const [pops, setPops] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [modePulse, setModePulse] = useState(0);
  const [save, setSave] = useState<SaveKind>("idle");
  const [pending, setPending] = useState<ReturnType<typeof publicResult> | null>(null);
  const [retrying, setRetrying] = useState(false);
  const sendingRef = useRef(false);
  const settings = DEFAULT_SETTINGS;
  const [, setTick] = useState(0);

  const gameRef = useRef(createLiveGame(0, { skipSave: true }));
  const playerRef = useRef(player);
  const startingRef = useRef(false);
  const pressRef = useRef<{
    id: ColorId;
    mode: string;
    seq: number;
    pointerId: number;
  } | null>(null);
  const moodTimer = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const popId = useRef(0);

  playerRef.current = player;

  useEffect(() => {
    try {
      setPending(readPendingResult(sessionStorage));
      const saved = localStorage.getItem("club-focus-language");
      if (saved === "en" || saved === "zh") setLanguage(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-Hant";
    try {
      localStorage.setItem("club-focus-language", language);
    } catch {
      /* ignore */
    }
  }, [language]);

  const bumpMood = useCallback((next: TurtleMood, ms = 420) => {
    setMood(next);
    window.clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setMood("idle"), ms) as unknown as number;
  }, []);

  const cue = useCallback((ok: boolean, s?: GameSettings) => {
    if (s?.vibrate !== false) {
      try {
        navigator.vibrate?.(ok ? 12 : 36);
      } catch {
        /* ignore */
      }
    }
    if (s?.sound === false) return;
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const vv = window.visualViewport;
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-h", String(Math.round(h)) + "px");
      root.classList.toggle("is-keyboard", Boolean(vv && window.innerHeight - vv.height > 80));
    };
    apply();
    const vv = window.visualViewport;
    window.addEventListener("resize", apply);
    vv?.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      vv?.removeEventListener("resize", apply);
    };
  }, []);

  const submitResult = useCallback(async (payload: ReturnType<typeof publicResult>) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setRetrying(true);
    setSave("idle");
    try {
      const response = await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error("Save failed");
      if (body.sheetsOk === true) {
        try {
          clearPendingResult(sessionStorage, payload.submissionId);
        } catch {
          /* Storage unavailable. */
        }
        setPending((current) => (current?.submissionId === payload.submissionId ? null : current));
      }
      if (gameRef.current.submissionId === payload.submissionId)
        setSave(body.sheetsOk === true ? "ok" : "local");
    } catch {
      if (gameRef.current.submissionId === payload.submissionId) setSave("fail");
    } finally {
      sendingRef.current = false;
      setRetrying(false);
    }
  }, []);

  const endGame = useCallback(() => {
    const g = gameRef.current;
    if (g.resultSubmitted) return;
    g.ended = true;
    g.completedAt ??= new Date().toISOString();
    g.resultSubmitted = true;
    if (g.kind === "warmup") {
      startingRef.current = false;
      setScreen("warmup-result");
      setSave("guest");
      return;
    }
    const payload = publicResult(g, playerRef.current);
    setScreen("result");
    if (g.skipSave) {
      setSave("guest");
      return;
    }
    setPending(payload);
    try {
      storePendingResult(sessionStorage, payload);
    } catch {
      /* Keep the in-memory retry available. */
    }
    void submitResult(payload);
  }, [submitResult]);

  const answer = useCallback(
    (id: ColorId, snapshot?: { mode: string; seq: number }) => {
      const g = gameRef.current;
      const now = performance.now();
      const judged = judgeAnswer(g, id, snapshot ?? { mode: g.mode, seq: g.questionSeq }, now);
      if (!judged.ok) {
        if (judged.reason === "expired") endGame();
        return;
      }
      if (judged.hit) {
        const combo = (judged.delta ?? 0) > 100;
        const text = combo ? "COMBO +" + judged.delta : "+" + judged.delta;
        setPops((xs) => [
          ...xs.slice(-3),
          { id: ++popId.current, text, kind: combo ? "combo" : "good" },
        ]);
        bumpMood(combo ? "cheer" : "happy");
        cue(true, g.settings);
      } else {
        const text = judged.delta === 0 ? "0" : String(judged.delta);
        setPops((xs) => [...xs.slice(-3), { id: ++popId.current, text, kind: "bad" }]);
        bumpMood("surprise");
        cue(false, g.settings);
      }
      if (judged.switched) setModePulse((n) => n + 1);
      setTick((n) => n + 1);
    },
    [bumpMood, endGame, cue],
  );

  const playAgain = useCallback(() => {
    startingRef.current = false;
    pressRef.current = null;
    setBusy(false);
    const nextPlayer = emptyPlayer();
    setPlayer(nextPlayer);
    playerRef.current = nextPlayer;
    setErrors({});
    gameRef.current = createLiveGame(performance.now(), { skipSave: true, settings });
    setPops([]);
    setSave("idle");
    setMood("wave");
    setModePulse(0);
    setScreen("register");
  }, [settings]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const api = {
      endNow: () => {
        const g = gameRef.current;
        g.startTime = performance.now() - (g.duration || 60) * 1000;
        endGame();
      },
      advanceMs: (ms: number) => {
        gameRef.current.startTime -= Number(ms) || 0;
        const tick = tickGame(gameRef.current, performance.now());
        if (tick.expired) endGame();
      },
      getState: () => ({
        ...gameRef.current,
        screen,
        playerName: playerRef.current.name,
        remaining: remainingSeconds(gameRef.current, performance.now()),
        correctId: gameRef.current.ended ? null : correctId(gameRef.current),
      }),
      answer: (id: ColorId) => answer(id),
    };
    (window as unknown as { __focusChallenge: typeof api }).__focusChallenge = api;
  }, [answer, screen, endGame]);

  function launchGame(next: Player, kind: "official" | "practice" | "warmup") {
    setPlayer(next);
    playerRef.current = next;
    gameRef.current =
      kind === "warmup"
        ? createWarmupGame(performance.now(), settings)
        : createLiveGame(performance.now(), {
            skipSave: kind === "practice",
            settings,
          });
    pressRef.current = null;
    window.clearTimeout(moodTimer.current);
    setPops([]);
    setMood("idle");
    setSave("idle");
    setModePulse(0);
    try {
      const C =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (C) {
        audioRef.current ??= new C();
        if (audioRef.current.state === "suspended") void audioRef.current.resume();
      }
    } catch {
      /* ignore */
    }
    setScreen("game");
  }

  function startChallenge() {
    if (startingRef.current || busy || pending) return;
    const parsed = validatePlayer(player);
    if (!parsed.ok) {
      setErrors(parsed.errors as Record<string, string | undefined>);
      return;
    }
    startingRef.current = true;
    setErrors({});
    const next = parsed.data as Player;
    setPlayer(next);
    playerRef.current = next;
    if (isOfficialSettings(settings)) {
      startingRef.current = false;
      setScreen("tutorial");
      return;
    }
    launchGame(next, "practice");
    startingRef.current = false;
  }

  function finishTutorial() {
    if (startingRef.current || screen !== "tutorial") return;
    startingRef.current = true;
    launchGame(playerRef.current, "warmup");
    startingRef.current = false;
  }

  function retryWarmup() {
    if (startingRef.current || screen !== "warmup-result" || gameRef.current.kind !== "warmup")
      return;
    startingRef.current = true;
    launchGame(playerRef.current, "warmup");
  }

  function continueOfficial() {
    if (startingRef.current || screen !== "warmup-result" || gameRef.current.kind !== "warmup")
      return;
    startingRef.current = true;
    setBusy(true);
    const next = playerRef.current;
    launchGame(next, "official");
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        await r.json().catch(() => ({}));
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timer);
        startingRef.current = false;
        setBusy(false);
      });
  }

  const g = gameRef.current;
  const q = g.question;

  return (
    <div className="app-root" data-screen={screen} data-session={g.kind}>
      <div className="shell">
        {pending && screen !== "game" && (
          <aside className="pending-result" role="status">
            <strong>
              {language === "zh" ? "有一筆成績尚未確認儲存" : "A score is awaiting confirmation"}
            </strong>
            <p>
              {language === "zh"
                ? "重試會沿用同一局編號，不會重複登記；完成或放棄後可開始新挑戰。"
                : "Retry keeps the same entry ID, without duplicating it. Retry or discard before a new entry."}
            </p>
            <button type="button" disabled={retrying} onClick={() => void submitResult(pending)}>
              {retrying
                ? language === "zh"
                  ? "傳送中…"
                  : "Sending…"
                : language === "zh"
                  ? "重試儲存"
                  : "Retry save"}
            </button>
            <button
              type="button"
              disabled={retrying}
              onClick={() => {
                try {
                  clearPendingResult(sessionStorage, pending.submissionId);
                } catch {
                  /* Storage unavailable. */
                }
                setPending(null);
              }}
            >
              {language === "zh" ? "放棄重試" : "Discard retry"}
            </button>
          </aside>
        )}
        {screen === "register" ? (
          <section className="screen screen-register active">
            <RegisterScreen
              language={language}
              onLanguage={setLanguage}
              player={player}
              errors={errors}
              busy={busy || Boolean(pending)}
              settings={settings}
              onChange={(key, value) => {
                setPlayer((p) => ({ ...p, [key]: value }));
                setErrors((e) => ({ ...e, [key]: undefined }));
              }}
              onStart={startChallenge}
            />
          </section>
        ) : null}

        {screen === "tutorial" ? (
          <TutorialScreen
            language={language}
            onLanguage={setLanguage}
            onFinished={finishTutorial}
          />
        ) : null}

        {screen === "game" ? (
          <section className="screen screen-game active">
            <ScoreHUD
              game={g}
              language={language}
              score={g.score}
              combo={g.combo}
              onExpire={endGame}
            />
            <div
              className={"mode-card mode-" + g.mode + (modePulse ? " switch" : "")}
              data-mode={g.mode}
              key={modePulse}
            >
              <LanguageToggle language={language} onChange={setLanguage} compact />
              {g.kind === "warmup" ? (
                <p className="eyebrow" data-warmup>
                  {TEXT[language].warmup}
                </p>
              ) : null}
              <div className="flash" />
              <small>
                {g.mode === "meaning"
                  ? TEXT[language].meaningInstruction
                  : TEXT[language].visualInstruction}
              </small>
              <strong>
                {g.mode === "meaning" ? TEXT[language].meaningMode : TEXT[language].visualMode}
              </strong>
            </div>
            <div className="play-area">
              {pops.map((p) => (
                <div key={p.id} className={"float-pop " + p.kind}>
                  {p.text}
                </div>
              ))}
              <div className="stroop-card" data-seq={g.questionSeq}>
                <div className="stroop" style={{ color: q.visual.hex }}>
                  {colorName(q.meaning.id as ColorId, language)}
                </div>
              </div>
              <span className="game-feedback" aria-hidden="true" data-mood={mood} />
            </div>
            <div className="deck-tray">
              <div className="answers">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={"ans ans-" + c.id}
                    aria-label={colorName(c.id as ColorId, language)}
                    data-color={c.id}
                    disabled={g.ended}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || !event.isPrimary) return;
                      pressRef.current = {
                        id: c.id as ColorId,
                        mode: g.mode,
                        seq: g.questionSeq,
                        pointerId: event.pointerId,
                      };
                    }}
                    onPointerUp={(event) => {
                      const press = pressRef.current;
                      if (
                        event.button !== 0 ||
                        !event.isPrimary ||
                        !press ||
                        press.pointerId !== event.pointerId ||
                        press.id !== c.id
                      )
                        return;
                      pressRef.current = null;
                      event.preventDefault();
                      answer(c.id as ColorId, { mode: press.mode, seq: press.seq });
                    }}
                    onPointerCancel={(event) => {
                      if (pressRef.current?.pointerId === event.pointerId) pressRef.current = null;
                    }}
                  >
                    {colorName(c.id as ColorId, language)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {screen === "result" || screen === "warmup-result" ? (
          <ResultScreen
            language={language}
            onLanguage={setLanguage}
            player={player}
            game={g}
            save={save}
            onAgain={playAgain}
            onContinue={continueOfficial}
            onPracticeAgain={retryWarmup}
          />
        ) : null}
      </div>
    </div>
  );
}

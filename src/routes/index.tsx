import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Turtle, type TurtleMood } from "@/components/turtle";
import {
  COLORS,
  CLUB_NAME,
  DEFAULT_SETTINGS,
  DEPARTMENT_GROUPS,
  DURATION_MAX,
  DURATION_MIN,
  GRADE_LIST,
  GUEST_PLAYER,
  START_MODE_OPTIONS,
  SPEED_PRESETS,
  clampSettings,
  colorByKey,
  correctId,
  createLiveGame,
  emptyPlayer,
  isOfficialSettings,
  judgeAnswer,
  nextQuestion,
  publicResult,
  remainingSeconds,
  tickGame,
  validatePlayer,
} from "@/lib/club/runtime.mjs";

export const Route = createFileRoute("/")({
  ssr: false,
  component: BoothApp,
});

type Screen = "register" | "game" | "result";
type Player = { name: string; department: string; grade: string; phone: string };
type GameSettings = {
  duration: number;
  switchMs: number;
  speed: string;
  comboEvery: number;
  tapLockMs: number;
  startMode: string;
  sound: boolean;
  vibrate: boolean;
};
type ColorId = (typeof COLORS)[number]["id"];
type SaveState =
  | { kind: "idle" }
  | { kind: "ok"; text: string }
  | { kind: "guest"; text: string }
  | { kind: "local"; text: string }
  | { kind: "fail"; text: string };

function BoothApp() {
  const [screen, setScreen] = useState<Screen>("register");
  const [player, setPlayer] = useState<Player>(emptyPlayer);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(DEFAULT_SETTINGS.duration);
  const [mood, setMood] = useState<TurtleMood>("idle");
  const [pops, setPops] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [modePulse, setModePulse] = useState(0);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [club, setClub] = useState(CLUB_NAME);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [, setTick] = useState(0);

  const gameRef = useRef(createLiveGame(0, { skipSave: true }));
  const playerRef = useRef(player);
  const startingRef = useRef(false);
  const pressRef = useRef<{ id: ColorId; mode: string; seq: number } | null>(null);
  const moodTimer = useRef(0);
  const timeNumRef = useRef<HTMLElement | null>(null);
  const timeRailRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const popId = useRef(0);

  playerRef.current = player;

  useEffect(() => {
    try {
      setSettings(clampSettings(JSON.parse(localStorage.getItem("club-focus-settings") || "null")));
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  function patchSettings(next: Partial<GameSettings>) {
    setSettings((prev: GameSettings) => {
      const merged = clampSettings({ ...prev, ...next });
      try {
        localStorage.setItem("club-focus-settings", JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    });
  }

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
      root.style.setProperty("--app-h", `${Math.round(h)}px`);
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

  const endGame = useCallback(() => {
    const g = gameRef.current;
    if (g.resultSubmitted) return;
    g.ended = true;
    g.resultSubmitted = true;
    const payload = publicResult(g, playerRef.current);
    setScreen("result");
    if (g.skipSave) {
      setSave({ kind: "guest", text: "這是試玩成績，沒有登記抽獎。" });
      return;
    }
    fetch("/api/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (d.clubName) setClub(d.clubName);
        if (!r.ok) {
          setSave({ kind: "fail", text: "成績沒有登記成功。請跟攤位同學說一聲。" });
          return;
        }
        if (d.sheetsOk) setSave({ kind: "ok", text: "成績已交給攤位。得獎現場公布，網站不公開榜單。" });
        else setSave({ kind: "local", text: "成績先留在畫面。得獎現場公布，網站不公開榜單。" });
      })
      .catch(() => {
        setSave({ kind: "fail", text: "成績沒有登記成功。網路暫時連不上，請跟攤位同學說一聲。" });
      });
  }, []);

  const answer = useCallback(
    (id: ColorId, snapshot?: { mode: string; seq: number }) => {
      const g = gameRef.current;
      const now = Date.now();
      const judged = judgeAnswer(g, id, snapshot, now);
      if (!judged.ok) {
        if (judged.reason === "expired") endGame();
        return;
      }
      if (judged.hit) {
        const combo = judged.combo >= 5;
        const text = combo ? `COMBO +${judged.delta}` : `+${judged.delta}`;
        setPops((xs) => [...xs.slice(-3), { id: ++popId.current, text, kind: combo ? "combo" : "good" }]);
        bumpMood(combo ? "cheer" : "happy");
        cue(true, g.settings);
      } else {
        const text = judged.delta === 0 ? "0" : `${judged.delta}`;
        setPops((xs) => [...xs.slice(-3), { id: ++popId.current, text, kind: "bad" }]);
        bumpMood("surprise");
        cue(false, g.settings);
      }
      setTick((n) => n + 1);
    },
    [bumpMood, endGame, cue],
  );

  useEffect(() => {
    if (screen !== "game") return undefined;
    let raf = 0;
    const loop = () => {
      const g = gameRef.current;
      const tick = tickGame(g);
      setRemaining(tick.remaining);
      if (timeNumRef.current) timeNumRef.current.textContent = String(Math.ceil(tick.remaining));
      if (timeRailRef.current) {
        timeRailRef.current.style.transform = `scaleX(${Math.max(0, tick.remaining / (g.duration || 60))})`;
      }
      if (tick.switched) setModePulse((n) => n + 1);
      if (tick.expired) {
        endGame();
        return;
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [screen, endGame]);

  useEffect(() => {
    if (screen !== "game") return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const id = colorByKey(e.key) as ColorId | null;
      if (!id) return;
      e.preventDefault();
      answer(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, answer]);

  const playAgain = useCallback(() => {
    startingRef.current = false;
    pressRef.current = null;
    setBusy(false);
    setPlayer(emptyPlayer());
    playerRef.current = emptyPlayer();
    setErrors({});
    gameRef.current = createLiveGame(Date.now(), { skipSave: true, settings });
    setRemaining(settings.duration);
    setPops([]);
    setSave({ kind: "idle" });
    setMood("wave");
    setModePulse(0);
    setScreen("register");
  }, [settings]);

  useEffect(() => {
    const api = {
      endNow: () => {
        const g = gameRef.current;
        g.startTime = Date.now() - (g.duration || 60) * 1000;
        endGame();
      },
      advanceMs: (ms: number) => {
        gameRef.current.startTime -= Number(ms) || 0;
        const tick = tickGame(gameRef.current);
        if (tick.expired) endGame();
      },
      getState: () => ({
        ...gameRef.current,
        screen,
        playerName: playerRef.current.name,
        remaining: remainingSeconds(gameRef.current),
        correctId: gameRef.current.ended ? null : correctId(gameRef.current),
      }),
      answer: (id: ColorId) => answer(id),
    };
    (window as unknown as { __focusChallenge: typeof api }).__focusChallenge = api;
  }, [answer, screen, endGame]);

  function launchGame(next: Player, skipSave: boolean) {
    setPlayer(next);
    playerRef.current = next;
    gameRef.current = createLiveGame(Date.now(), { skipSave, settings });
    pressRef.current = null;
    setRemaining(settings.duration);
    setPops([]);
    setMood("idle");
    setSave({ kind: "idle" });
    setModePulse(0);
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
    if (startingRef.current || busy) return;
    const parsed = validatePlayer(player);
    if (!parsed.ok) {
      setErrors(parsed.errors as Record<string, string | undefined>);
      return;
    }
    startingRef.current = true;
    setBusy(true);
    setErrors({});
    launchGame(parsed.data as Player, !isOfficialSettings(settings));
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (d.clubName) setClub(d.clubName);
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timer);
        startingRef.current = false;
        setBusy(false);
      });
  }

  function startGuest() {
    if (startingRef.current || busy) return;
    startingRef.current = true;
    setErrors({});
    launchGame(GUEST_PLAYER, true);
    startingRef.current = false;
  }

  const g = gameRef.current;
  const q = g.question;
  const timeShow = Math.ceil(remaining);
  const timeRatio = Math.max(0, Math.min(1, remaining / (g.duration || 60)));

  return (
    <div className="app-root" data-screen={screen}>
      <div className="shell">
        {screen === "register" ? (
          <section className="screen screen-register active">
            <RegisterScreen
              player={player}
              errors={errors}
              busy={busy}
              settings={settings}
              onSettings={patchSettings}
              onChange={(key, value) => {
                setPlayer((p) => ({ ...p, [key]: value }));
                setErrors((e) => ({ ...e, [key]: undefined }));
              }}
              onStart={startChallenge}
              onTryPlay={startGuest}
            />
          </section>
        ) : null}

        {screen === "game" ? (
          <section className="screen screen-game active">
            <div className="game-top">
              <div className={`time-board${timeShow <= 10 ? " warn" : ""}`} role="timer" aria-label="剩餘秒數">
                <span>剩餘</span>
                <strong data-time ref={(el) => { timeNumRef.current = el; }}>{timeShow}</strong>
              </div>
              <div className="game-stats">
                <div>
                  <span>分數</span>
                  <strong data-score>{g.score}</strong>
                </div>
                <div>
                  <span>連擊</span>
                  <strong data-combo>x{g.combo}</strong>
                </div>
              </div>
            </div>
            <div className={`time-rail${timeShow <= 10 ? " is-warn" : ""}`} aria-hidden="true">
              <i ref={(el) => { timeRailRef.current = el; }} style={{ transform: `scaleX(${timeRatio})` }} />
            </div>
            <div className={`mode-card mode-${g.mode}${modePulse ? " switch" : ""}`} data-mode={g.mode} key={modePulse}>
              <div className="flash" />
              <small>{g.mode === "meaning" ? "選文字寫的顏色" : "選字的實際顏色"}</small>
              <strong>{g.mode === "meaning" ? "【字面意思】" : "【視覺顏色】"}</strong>
            </div>
            <div className="play-area">
              {pops.map((p) => (
                <div key={p.id} className={`float-pop ${p.kind}`}>{p.text}</div>
              ))}
              <div className="stroop-card" data-seq={g.questionSeq}>
                <div className="stroop" style={{ color: q.visual.hex }}>{q.meaning.label}</div>
              </div>
              <Turtle mood={mood} size={52} />
            </div>
            <div className="deck-tray">
              <div className="answers">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ans ans-${c.id}`}
                    aria-label={`${c.label}色`}
                    data-color={c.id}
                    disabled={g.ended}
                    onPointerDown={() => {
                      pressRef.current = { id: c.id, mode: g.mode, seq: g.questionSeq };
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      const press = pressRef.current;
                      pressRef.current = null;
                      if (!press || press.id !== c.id) return;
                      answer(c.id, { mode: press.mode, seq: press.seq });
                    }}
                    onPointerCancel={() => { pressRef.current = null; }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="keys-hint">鍵盤 1 紅 · 2 藍 · 3 綠 · 4 黃</p>
            </div>
          </section>
        ) : null}

        {screen === "result" ? (
          <ResultScreen player={player} game={g} save={save} club={club} onAgain={playAgain} />
        ) : null}
      </div>
    </div>
  );
}

function RegisterScreen({
  player,
  errors,
  busy,
  settings,
  onSettings,
  onChange,
  onStart,
  onTryPlay,
}: {
  player: Player;
  errors: Record<string, string | undefined>;
  busy: boolean;
  settings: GameSettings;
  onSettings: (next: Partial<GameSettings>) => void;
  onChange: (key: keyof Player, value: string) => void;
  onStart: () => void;
  onTryPlay: () => void;
}) {
  const official = isOfficialSettings(settings);
  const [openSettings, setOpenSettings] = useState(false);
  return (
    <form className="register-layout" data-register="official" noValidate autoComplete="on" onSubmit={(e) => { e.preventDefault(); onStart(); }}>
      <figure className="scene-hero">
        <img src="/scene-hero.jpg" alt="淡江禪學社：龜龜與同學" width="880" height="400" fetchPriority="high" decoding="async" />
        <figcaption className="scene-hero-overlay">
          <p className="eyebrow">淡江大學禪學社 · 社團博覽會</p>
          <h1 className="hero-title">專注力挑戰賽</h1>
          <p className="hero-facts">
            <span>60 秒</span>
            <span>看指令選顏色</span>
            <span>現場手搖杯</span>
          </p>
        </figcaption>
        <button
          type="button"
          className="gear-btn"
          aria-label="開啟設定"
          data-open-settings
          onClick={() => setOpenSettings(true)}
        >
          <GearIcon />
        </button>
      </figure>
      <div className="sheet-register">
        <div className="form-kicker">
          <Turtle mood="wave" size={48} />
          <div>
            <h2>正式參賽</h2>
            <p>{official ? "填資料開始 60 秒。得獎現場公布，網站不公開成績。" : "目前是練習規則，成績不登記抽獎。"}</p>
          </div>
        </div>
        <div className={`field${errors.name ? " is-invalid" : ""}`}>
          <label htmlFor="name">姓名 <span className="req">*</span></label>
          <input id="name" name="name" autoComplete="name" value={player.name} onChange={(e) => onChange("name", e.target.value)} placeholder="例如：小華" />
          <span className="field-err">{errors.name ?? ""}</span>
        </div>
        <div className={`field${errors.department ? " is-invalid" : ""}`}>
          <label htmlFor="department">科系 <span className="req">*</span></label>
          <select id="department" name="department" value={player.department} onChange={(e) => onChange("department", e.target.value)}>
            <option value="">請選擇淡江科系</option>
            {DEPARTMENT_GROUPS.map((g) => (
              <optgroup key={g.college} label={g.college}>
                {g.items.map((d) => <option key={d} value={d}>{d}</option>)}
              </optgroup>
            ))}
          </select>
          <span className="field-err">{errors.department ?? ""}</span>
        </div>
        <div className={`field${errors.grade ? " is-invalid" : ""}`}>
          <span id="grade-label">年級 <span className="req">*</span></span>
          <select id="grade" className="sr-only" value={player.grade} onChange={(e) => onChange("grade", e.target.value)}>
            <option value="">請選擇年級</option>
            {GRADE_LIST.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="grade-picks" role="radiogroup" aria-labelledby="grade-label">
            {GRADE_LIST.map((g) => (
              <button key={g} type="button" className={`grade-pick${player.grade === g ? " is-on" : ""}`} data-grade={g} aria-pressed={player.grade === g} onClick={() => onChange("grade", g)}>{g}</button>
            ))}
          </div>
          <span className="field-err">{errors.grade ?? ""}</span>
        </div>
        <div className={`field${errors.phone ? " is-invalid" : ""}`}>
          <label htmlFor="phone">電話 <span className="req">*</span></label>
          <input id="phone" name="tel" type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} value={player.phone} onChange={(e) => onChange("phone", e.target.value.replace(/[^\d]/g, "").slice(0, 10))} placeholder="09xxxxxxxx" />
          <span className="field-err">{errors.phone ?? ""}</span>
        </div>
      </div>
      <div className="cta-dock">
        <button type="submit" className="cta" data-cta="official" disabled={busy}>
          {busy ? "準備中…" : official ? "正式參賽，開始 60 秒 →" : `開始 ${settings.duration} 秒練習 →`}
        </button>
        <p className="privacy">
          {official
            ? "成績與得獎都不會在網站公開。電話只用來聯絡得獎。資料只用於本次活動。試玩不登記、不抽獎。"
            : "這次用的是練習設定，成績不會登記抽獎。要抽獎請先恢復正式規則。"}
        </p>
        <button type="button" className="guest-link" data-cta="guest" onClick={onTryPlay}>只想試玩，不登記也不抽獎</button>
      </div>
      {openSettings ? (
        <SettingsSheet
          settings={settings}
          official={official}
          onSettings={onSettings}
          onClose={() => setOpenSettings(false)}
        />
      ) : null}
    </form>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 12.9c.06-.3.1-.6.1-.9s-.04-.6-.1-.9l2-1.5-1.9-3.3-2.3.7c-.5-.4-1-.7-1.6-.9L15 3h-6l-.6 2.1c-.6.2-1.1.5-1.6.9l-2.3-.7L3.6 8.6l2 1.5c-.06.3-.1.6-.1.9s.04.6.1.9l-2 1.5 1.9 3.3 2.3-.7c.5.4 1 .7 1.6.9L9 21h6l.6-2.1c.6-.2 1.1-.5 1.6-.9l2.3.7 1.9-3.3-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsSheet({
  settings,
  official,
  onSettings,
  onClose,
}: {
  settings: GameSettings;
  official: boolean;
  onSettings: (next: Partial<GameSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="settings-mask" data-settings="1" onClick={onClose} role="presentation">
      <div
        className="settings-sheet"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h3 id="settings-title">挑戰設定</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="關閉設定">
            完成
          </button>
        </div>
        <SettingsPreview settings={settings} />
        <label className="slider-row" htmlFor="set-duration">
          <span>時間</span>
          <strong data-duration-value>
            {settings.duration} 秒{settings.duration === 60 ? " · 正式" : ""}
          </strong>
        </label>
        <input
          id="set-duration"
          className="slider"
          type="range"
          min={DURATION_MIN}
          max={DURATION_MAX}
          step={5}
          value={settings.duration}
          data-duration-slider
          onChange={(e) => onSettings({ duration: Number(e.target.value) })}
        />
        <div className="slider-ends"><span>{DURATION_MIN}s</span><span>60s</span><span>{DURATION_MAX}s</span></div>
        <label className="slider-row" htmlFor="set-speed">
          <span>速度</span>
          <strong data-speed-value>
            {SPEED_PRESETS.find((p) => p.id === settings.speed)?.label ?? "一般"} · {SPEED_PRESETS.find((p) => p.id === settings.speed)?.hint}
          </strong>
        </label>
        <input
          id="set-speed"
          className="slider"
          type="range"
          min={0}
          max={SPEED_PRESETS.length - 1}
          step={1}
          value={Math.max(0, SPEED_PRESETS.findIndex((p) => p.id === settings.speed))}
          data-speed-slider
          onChange={(e) => onSettings({ speed: SPEED_PRESETS[Number(e.target.value)]?.id })}
        />
        <div className="slider-ends">{SPEED_PRESETS.map((p) => <span key={p.id}>{p.label}</span>)}</div>
        <p className="settings-label">起始規則</p>
        <div className="grade-picks" role="radiogroup" aria-label="起始規則">
          {START_MODE_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`grade-pick${settings.startMode === s.id ? " is-on" : ""}`}
              data-start-mode={s.id}
              aria-pressed={settings.startMode === s.id}
              onClick={() => onSettings({ startMode: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="settings-toggles">
          <button type="button" className={`grade-pick${settings.sound ? " is-on" : ""}`} aria-pressed={settings.sound} data-sound={settings.sound ? "on" : "off"} onClick={() => onSettings({ sound: !settings.sound })}>
            音效 {settings.sound ? "開" : "關"}
          </button>
          <button type="button" className={`grade-pick${settings.vibrate ? " is-on" : ""}`} aria-pressed={settings.vibrate} data-vibrate={settings.vibrate ? "on" : "off"} onClick={() => onSettings({ vibrate: !settings.vibrate })}>
            震動 {settings.vibrate ? "開" : "關"}
          </button>
        </div>
        {official ? (
          <p className="settings-note">目前是社博正式規則：60 秒、一般速度、答對 +100／連擊 +200／答錯 −50。</p>
        ) : (
          <button type="button" className="settings-reset" onClick={() => onSettings(DEFAULT_SETTINGS)}>
            恢復正式規則
          </button>
        )}
      </div>
    </div>
  );
}

function SettingsPreview({ settings }: { settings: GameSettings }) {
  const [q, setQ] = useState(() => nextQuestion(null));
  const [mode, setMode] = useState<"meaning" | "visual">(settings.startMode === "visual" ? "visual" : "meaning");
  const [left, setLeft] = useState(settings.duration);
  const [pulse, setPulse] = useState(0);
  const startRef = useRef(Date.now());
  const lastSwitch = useRef(Date.now());
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    startRef.current = Date.now();
    lastSwitch.current = Date.now();
    setLeft(settings.duration);
    if (settings.startMode === "visual" || settings.startMode === "meaning") {
      setMode(settings.startMode);
    }
  }, [settings.duration, settings.switchMs, settings.startMode]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const elapsed = (now - startRef.current) / 1000;
      const remain = Math.max(0, settings.duration - elapsed);
      setLeft(remain);
      if (remain <= 0) {
        startRef.current = now;
        setQ(nextQuestion(null));
      }
      if (now - lastSwitch.current >= settings.switchMs) {
        lastSwitch.current = now;
        setMode((m) => (m === "meaning" ? "visual" : "meaning"));
        setQ((prev) => nextQuestion(prev));
        setPulse((n) => n + 1);
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [settings.duration, settings.switchMs]);

  return (
    <div className="settings-preview" data-preview="1">
      <div className="preview-hud">
        <span>預覽</span>
        <strong>{Math.ceil(left)}s</strong>
      </div>
      <div className={`preview-mode${pulse ? " switch" : ""}`} key={pulse}>
        {mode === "meaning" ? "選文字寫的顏色 · 字面意思" : "選字的實際顏色 · 視覺顏色"}
      </div>
      <div className="preview-word" style={{ color: q.visual.hex }}>{q.meaning.label}</div>
      <div className="preview-dots">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`preview-dot ans-${c.id}`}
            aria-label={`${c.label}色`}
            onClick={() => {
              const expected = modeRef.current === "meaning" ? q.meaning.id : q.visual.id;
              setQ(nextQuestion(q));
              if (expected === c.id) setPulse((n) => n + 1);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultScreen({
  player,
  game,
  save,
  club,
  onAgain,
}: {
  player: Player;
  game: ReturnType<typeof createLiveGame>;
  save: SaveState;
  club: string;
  onAgain: () => void;
}) {
  const payload = publicResult(game, player);
  return (
    <section className="screen screen-result active">
      <div className="result-sheet" data-result="1">
        <p className="eyebrow" style={{ textAlign: "center" }}>{club}</p>
        <div className="score-xl" data-result-score>{payload.score}</div>
        <h2 className="result-title">{payload.title}</h2>
        <p className="title-blurb">{payload.blurb}</p>
        <div className="result-meta">
          <div><span>正確率</span><strong>{payload.accuracy}%</strong></div>
          <div><span>最高連擊</span><strong>x{payload.maxCombo}</strong></div>
          <div><span>答對</span><strong>{payload.correct}</strong></div>
          <div><span>答錯</span><strong>{payload.wrong}</strong></div>
        </div>
        <p className="save-note" data-save={save.kind}>{save.kind === "idle" ? "成績傳送中…" : save.text}</p>
        <p className="join-copy">想更認識自己、練習專注與表達，歡迎來{club}坐坐。手搖杯得獎現場公布，網站不公開成績。</p>
        <button type="button" className="cta" onClick={onAgain}>重新挑戰</button>
        <button type="button" className="cta secondary" onClick={onAgain}>回首頁</button>
      </div>
    </section>
  );
}

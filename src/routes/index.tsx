import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Turtle, type TurtleMood } from "@/components/turtle";
import { AdminLogin } from "@/components/admin-login";
import { ScoreHUD } from "@/components/club/score-hud";
import { Settings, ShieldCheck, Timer, ArrowRightLeft } from "lucide-react";
import { clearPendingResult, readPendingResult, storePendingResult } from "@/lib/club/pending-result.mjs";
import {
  COLORS,
  DEFAULT_SETTINGS,
  DEPARTMENT_GROUPS,
  GRADE_LIST,
  colorByKey,
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

export const Route = createFileRoute("/")({
  ssr: false,
  component: BoothApp,
});

type Screen = "register" | "game" | "warmup-result" | "result";
type Language = "en" | "zh";
type Player = {
  name: string;
  department: string;
  grade: string;
  phone: string;
  gatekeeper: string;
};
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
type SaveKind = "idle" | "ok" | "guest" | "local" | "fail";

const TEXT = {
  en: {
    title: "Focus Challenge",
    factSeconds: "60 seconds",
    factInstruction: "Read the rule · tap the color",
    factPrize: "On-site bubble tea",
    officialEntry: "Official Entry",
    officialDescription:
      "Enter your details, warm up for 15 seconds, then start a fresh 60-second challenge. Winners are announced at the booth; scores are not published online.",
    practiceDescription: "Practice mode is active. This score is not entered into the prize draw.",
    name: "Name",
    department: "Department",
    year: "Year",
    mobile: "Mobile number",
    gatekeeper: "Booth leader",
    chooseGatekeeper: "Choose the booth leader guiding you",
    customGatekeeper: "Custom",
    customGatekeeperPlaceholder: "Enter the booth leader name",
    selectDepartment: "Select your Tamkang department",
    selectYear: "Select your year",
    namePlaceholder: "e.g. Alex",
    phonePlaceholder: "10-digit mobile number",
    preparing: "Preparing…",
    officialStart: "Start 15-second warm-up →",
    warmup: "Warm-up · Practice only",
    warmupComplete: "Warm-up complete",
    warmupDescription:
      "Your practice score stays here; nothing has been registered or submitted. Your details are ready. Continue when you are ready for a fresh 60-second challenge.",
    warmupRetry: "Practice again · 15 seconds",
    officialContinue: "Continue · Start official 60 seconds →",
    practiceStartPrefix: "Start ",
    practiceStartSuffix: "-second practice →",
    settings: "Challenge settings",
    done: "Done",
    preview: "Preview",
    time: "Time",
    speed: "Speed",
    startRule: "Starting rule",
    sound: "Sound",
    vibration: "Vibration",
    on: "On",
    off: "Off",
    official: "Official",
    seconds: "seconds",
    restoreOfficial: "Restore official rules",
    officialRules:
      "Official club rules: 60 seconds, the rule changes once after each answer, +100 for a correct answer / +200 for a combo / −50 for a mistake.",
    slow: "Slow",
    normal: "Normal",
    fast: "Fast",
    rush: "Rush",
    slowHint: "Changes after each answer",
    normalHint: "Changes after each answer",
    fastHint: "Changes after each answer",
    rushHint: "Changes after each answer",
    timeLeft: "Time left",
    score: "Score",
    combo: "Combo",
    meaningInstruction: "Tap the color named by the word",
    visualInstruction: "Tap the ink color",
    meaningMode: "Word meaning",
    visualMode: "Ink color",
    keyHint: "Keyboard: 1 Red · 2 Blue · 3 Green · 4 Yellow",
    accuracy: "Accuracy",
    bestCombo: "Best combo",
    correct: "Correct",
    wrong: "Wrong",
    saving: "Saving your score…",
    tryAgain: "Try again",
    home: "Back to start",
  },
  zh: {
    title: "專注力挑戰賽",
    factSeconds: "60 秒",
    factInstruction: "看指令選顏色",
    factPrize: "現場手搖杯",
    officialEntry: "正式參賽",
    officialDescription:
      "填資料後先練習 15 秒，再開始全新的 60 秒正式挑戰。得獎現場公布，網站不公開成績。",
    practiceDescription: "目前是練習規則，成績不登記抽獎。",
    name: "姓名",
    department: "科系",
    year: "年級",
    mobile: "電話",
    gatekeeper: "關主",
    chooseGatekeeper: "請選擇帶你闖關的關主",
    customGatekeeper: "自訂",
    customGatekeeperPlaceholder: "輸入關主姓名",
    selectDepartment: "請選擇淡江科系",
    selectYear: "請選擇年級",
    namePlaceholder: "例如：小華",
    phonePlaceholder: "09xxxxxxxx",
    preparing: "準備中…",
    officialStart: "開始 15 秒賽前練習 →",
    warmup: "賽前練習 · 不計正式成績",
    warmupComplete: "賽前練習完成",
    warmupDescription:
      "練習成績只留在這裡，尚未登記或傳送任何資料。你的參賽資料已準備好，準備好了再開始全新的 60 秒正式挑戰。",
    warmupRetry: "再練習一次 · 15 秒",
    officialContinue: "繼續，開始正式 60 秒 →",
    practiceStartPrefix: "開始 ",
    practiceStartSuffix: " 秒練習 →",
    settings: "挑戰設定",
    done: "完成",
    preview: "預覽",
    time: "時間",
    speed: "速度",
    startRule: "起始規則",
    sound: "音效",
    vibration: "震動",
    on: "開",
    off: "關",
    official: "正式",
    seconds: "秒",
    restoreOfficial: "恢復正式規則",
    officialRules:
      "目前是社博正式規則：60 秒，每答完一題只換一次規則，答對 +100／連擊 +200／答錯 −50。",
    slow: "慢",
    normal: "一般",
    fast: "快",
    rush: "極快",
    slowHint: "每答一題換規則",
    normalHint: "每答一題換規則",
    fastHint: "每答一題換規則",
    rushHint: "每答一題換規則",
    timeLeft: "剩餘",
    score: "分數",
    combo: "連擊",
    meaningInstruction: "選文字寫的顏色",
    visualInstruction: "選字的實際顏色",
    meaningMode: "【字面意思】",
    visualMode: "【視覺顏色】",
    keyHint: "鍵盤 1 紅 · 2 藍 · 3 綠 · 4 黃",
    accuracy: "正確率",
    bestCombo: "最高連擊",
    correct: "答對",
    wrong: "答錯",
    saving: "成績傳送中…",
    tryAgain: "重新挑戰",
    home: "回首頁",
  },
} as const;

const GATEKEEPERS = ["柏能", "安倢", "小哲", "振泰"];

const COLOR_NAMES: Record<ColorId, { en: string; zh: string }> = {
  red: { en: "Red", zh: "紅" },
  blue: { en: "Blue", zh: "藍" },
  green: { en: "Green", zh: "綠" },
  yellow: { en: "Yellow", zh: "黃" },
};

const GRADE_NAMES: Record<string, { en: string; zh: string }> = {
  大一: { en: "Year 1", zh: "大一" },
  大二: { en: "Year 2", zh: "大二" },
  大三: { en: "Year 3", zh: "大三" },
  大四: { en: "Year 4", zh: "大四" },
  碩士班: { en: "Master's", zh: "碩士班" },
  博士班: { en: "Doctoral", zh: "博士班" },
  其他: { en: "Other", zh: "其他" },
};

const COLLEGE_NAMES: Record<string, { en: string; zh: string }> = {
  文學院: { en: "College of Liberal Arts", zh: "文學院" },
  教育學院: { en: "College of Education", zh: "教育學院" },
  外國語文學院: { en: "College of Foreign Languages", zh: "外國語文學院" },
  商管學院: { en: "College of Business and Management", zh: "商管學院" },
  國際學院: { en: "College of Global Development", zh: "國際學院" },
  理學院: { en: "College of Science", zh: "理學院" },
  工學院: { en: "College of Engineering", zh: "工學院" },
  人工智慧學院: { en: "College of Artificial Intelligence", zh: "人工智慧學院" },
};

const DEPARTMENT_NAMES: Record<string, string> = {
  中國文學學系: "Department of Chinese Literature",
  歷史學系: "Department of History",
  資訊與圖書館學系: "Department of Information and Library Science",
  大眾傳播學系: "Department of Mass Communication",
  資訊傳播學系: "Department of Information and Communication",
  教育科技學系: "Department of Educational Technology",
  教育與未來設計學系: "Department of Education and Futures Design",
  英文學系: "Department of English",
  英文學系全英語學士班: "English-taught Bachelor's Program, Department of English",
  日本語文學系: "Department of Japanese",
  法國語文學系: "Department of French",
  德國語文學系: "Department of German",
  西班牙語文學系: "Department of Spanish",
  俄國語文學系: "Department of Russian",
  國際企業學系: "Department of International Business",
  國際企業學系全英語學士班:
    "English-taught Bachelor's Program, Department of International Business",
  經濟學系: "Department of Economics",
  產業經濟學系: "Department of Industrial Economics",
  會計學系: "Department of Accounting",
  企業管理學系: "Department of Business Administration",
  企業管理學系全英語學士班:
    "English-taught Bachelor's Program, Department of Business Administration",
  財務金融學系: "Department of Banking and Finance",
  風險管理與保險學系: "Department of Risk Management and Insurance",
  統計學系: "Department of Statistics",
  資訊管理學系: "Department of Information Management",
  公共行政學系: "Department of Public Administration",
  運輸管理學系: "Department of Transportation Management",
  國際觀光管理學系全英語學士班:
    "English-taught Bachelor's Program, Department of International Tourism Management",
  全球政治經濟學系全英語學士班:
    "English-taught Bachelor's Program, Department of Global Political Economy",
  數學學系資訊與數據科學組: "Department of Mathematics — Information and Data Science",
  數學學系應數統計組: "Department of Mathematics — Applied Mathematics and Statistics",
  物理學系: "Department of Physics",
  化學學系: "Department of Chemistry",
  建築學系: "Department of Architecture",
  土木工程學系: "Department of Civil Engineering",
  水資源及環境工程學系: "Department of Water Resources and Environmental Engineering",
  機械與機電工程學系: "Department of Mechanical and Electro-Mechanical Engineering",
  化學工程與材料工程學系: "Department of Chemical and Materials Engineering",
  電機工程學系: "Department of Electrical Engineering",
  資訊工程學系: "Department of Computer Science and Information Engineering",
  航空太空工程學系: "Department of Aerospace Engineering",
  人工智慧學系: "Department of Artificial Intelligence",
};

const TITLE_NAMES: Record<string, string> = {
  "Lv.4 卓越領袖": "Lv.4 Outstanding Leader",
  "Lv.3 穩定領航者": "Lv.3 Steady Navigator",
  "Lv.2 潛力領袖": "Lv.2 Emerging Leader",
  "Lv.1 心靈修煉者": "Lv.1 Mindful Practitioner",
};

const BLURBS_EN: Record<string, string> = {
  "Lv.4 卓越領袖":
    "In these 60 seconds, you kept your eyes on the rule and rarely let the color lead you.",
  "Lv.3 穩定領航者": "You quickly found your rhythm again whenever the rule changed.",
  "Lv.2 潛力領袖":
    "Your focus is already taking shape. A little more rhythm will make it steadier.",
  "Lv.1 心靈修煉者":
    "This is a starting point. Play again and your eyes will catch the rule more easily.",
};

const VALIDATION_EN: Record<string, string> = {
  請填寫姓名: "Please enter your name.",
  "請填 1–20 字的真實姓名": "Please enter a real name between 1 and 20 characters.",
  請選擇淡江科系: "Please select your Tamkang department.",
  請從名單選擇淡江科系: "Please choose a department from the list.",
  請選擇年級: "Please select your year.",
  請選擇關主: "Please choose your booth leader.",
  "請填 1–20 字的關主姓名": "Please enter a booth leader name between 1 and 20 characters.",
  請填寫手機: "Please enter your mobile number.",
  "請填 09 開頭的 10 碼手機": "Please enter a 10-digit mobile number starting with 09.",
};

function colorName(id: ColorId, language: Language) {
  return COLOR_NAMES[id][language];
}

function gradeName(grade: string, language: Language) {
  return GRADE_NAMES[grade]?.[language] ?? grade;
}

function collegeName(college: string, language: Language) {
  return COLLEGE_NAMES[college]?.[language] ?? college;
}

function departmentName(department: string, language: Language) {
  if (language === "zh") return department;
  return DEPARTMENT_NAMES[department] ?? department;
}

function resultTitle(title: string, language: Language) {
  return language === "en" ? (TITLE_NAMES[title] ?? title) : title;
}

function resultBlurb(title: string, language: Language, duration: number, fallback: string) {
  if (language === "zh") return fallback;
  return (BLURBS_EN[title] ?? fallback).replace("60 seconds", String(duration) + " seconds");
}

function saveText(kind: SaveKind, language: Language) {
  if (kind === "idle") return TEXT[language].saving;
  if (kind === "guest") {
    return language === "zh"
      ? "這是試玩成績，沒有登記抽獎。"
      : "Practice score only. It was not entered into the prize draw.";
  }
  if (kind === "ok") {
    return language === "zh"
      ? "成績已交給攤位。得獎現場公布，網站不公開榜單。"
      : "Score sent to the booth. Winners will be announced on site; scores are not published online.";
  }
  if (kind === "local") {
    return language === "zh"
      ? "成績先留在畫面。得獎現場公布，網站不公開榜單。"
      : "Your score is shown here for now. Winners will be announced on site; scores are not published online.";
  }
  return language === "zh"
    ? "成績沒有登記成功。請跟攤位同學說一聲。"
    : "We could not save your score. Please tell a booth volunteer.";
}

function validationText(message: string | undefined, language: Language) {
  if (!message) return "";
  return language === "zh" ? message : (VALIDATION_EN[message] ?? message);
}

function LanguageToggle({
  language,
  onChange,
  compact = false,
}: {
  language: Language;
  onChange: (language: Language) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={"language-toggle" + (compact ? " compact" : "")}
      role="group"
      aria-label={language === "en" ? "Language / 語言" : "語言 / Language"}
      data-language-switcher
    >
      <button
        type="button"
        className={language === "en" ? "is-active" : ""}
        aria-pressed={language === "en"}
        onClick={() => onChange("en")}
      >
        English
      </button>
      <button
        type="button"
        className={language === "zh" ? "is-active" : ""}
        aria-pressed={language === "zh"}
        onClick={() => onChange("zh")}
      >
        中文
      </button>
    </div>
  );
}

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
  const pressRef = useRef<{ id: ColorId; mode: string; seq: number } | null>(null);
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
        try { clearPendingResult(sessionStorage, payload.submissionId); } catch { /* Storage unavailable. */ }
        setPending((current) => current?.submissionId === payload.submissionId ? null : current);
      }
      if (gameRef.current.submissionId === payload.submissionId) setSave(body.sheetsOk === true ? "ok" : "local");
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
    try { storePendingResult(sessionStorage, payload); } catch { /* Keep the in-memory retry available. */ }
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

  useEffect(() => {
    if (screen !== "game") return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) {
        if (e.key === "Enter" || e.key === " " || colorByKey(e.key)) e.preventDefault();
        return;
      }
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
    if (isOfficialSettings(settings)) {
      launchGame(parsed.data as Player, "warmup");
    } else {
      launchGame(parsed.data as Player, "practice");
      startingRef.current = false;
    }
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
            <strong>{language === "zh" ? "有一筆成績尚未確認儲存" : "A score is awaiting confirmation"}</strong>
            <p>{language === "zh" ? "重試會沿用同一局編號，不會重複登記；完成或放棄後可開始新挑戰。" : "Retry keeps the same entry ID, without duplicating it. Retry or discard before a new entry."}</p>
            <button type="button" disabled={retrying} onClick={() => void submitResult(pending)}>
              {retrying ? (language === "zh" ? "傳送中…" : "Sending…") : (language === "zh" ? "重試儲存" : "Retry save")}
            </button>
            <button type="button" disabled={retrying} onClick={() => {
              try { clearPendingResult(sessionStorage, pending.submissionId); } catch { /* Storage unavailable. */ }
              setPending(null);
            }}>{language === "zh" ? "放棄重試" : "Discard retry"}</button>
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
              <Turtle mood={mood} size={52} />
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
                    onPointerDown={() => {
                      pressRef.current = { id: c.id as ColorId, mode: g.mode, seq: g.questionSeq };
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      const press = pressRef.current;
                      pressRef.current = null;
                      if (!press || press.id !== c.id) return;
                      answer(c.id as ColorId, { mode: press.mode, seq: press.seq });
                    }}
                    onPointerCancel={() => {
                      pressRef.current = null;
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) answer(c.id as ColorId);
                    }}
                  >
                    {colorName(c.id as ColorId, language)}
                  </button>
                ))}
              </div>
              <p className="keys-hint">{TEXT[language].keyHint}</p>
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

function RegisterScreen({
  language,
  onLanguage,
  player,
  errors,
  busy,
  settings,
  onChange,
  onStart,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  player: Player;
  errors: Record<string, string | undefined>;
  busy: boolean;
  settings: GameSettings;
  onChange: (key: keyof Player, value: string) => void;
  onStart: () => void;
}) {
  const ui = TEXT[language];
  const official = isOfficialSettings(settings);
  const [openAdmin, setOpenAdmin] = useState(false);
  const [gatekeeperChoice, setGatekeeperChoice] = useState(() =>
    GATEKEEPERS.includes(player.gatekeeper)
      ? player.gatekeeper
      : player.gatekeeper
        ? "__custom__"
        : "",
  );

  return (
    <>
    <form
      className="register-layout"
      data-register="official"
      noValidate
      autoComplete="on"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <header className="club-header">
        <a className="club-brand" href="/" aria-label={language === "zh" ? "首頁" : "Home"}>
          <img src="/club-mark.svg" alt="" width="38" height="38" />
        </a>
        <div className="header-actions">
          <LanguageToggle language={language} onChange={onLanguage} />
          <button
            type="button"
            className="gear-btn"
            aria-label={language === "en" ? "Administrator login" : "管理員登入"}
            data-admin-login
            onClick={() => setOpenAdmin(true)}
          >
            <Settings size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <figure className="scene-hero">
        <img
          src="/scene-hero.jpg"
          alt={
            language === "en"
              ? "Turtle and students"
              : "龜龜與同學"
          }
          width="880"
          height="400"
          fetchPriority="high"
          decoding="async"
        />
        <figcaption className="scene-hero-overlay">
          <h1 className="hero-title">{ui.title}</h1>
          <p className="hero-subtitle">{language === "zh" ? "讓心安定，讓專注發光。" : "A calm mind. A sharper focus."}</p>
        </figcaption>
      </figure>
      <div className="challenge-rules" aria-label={language === "zh" ? "挑戰規則" : "Challenge rules"}>
        <div className="rule-chip"><Timer size={18} aria-hidden="true" /><span>{ui.time}<strong>60 {ui.seconds}</strong></span></div>
        <div className="rule-chip"><ShieldCheck size={18} aria-hidden="true" /><span>{ui.speed}<strong>{ui.normal}</strong></span></div>
        <div className="rule-chip"><ArrowRightLeft size={18} aria-hidden="true" /><span>{language === "zh" ? "規則" : "Rule"}<strong>{language === "zh" ? "每題切換" : "Switch each answer"}</strong></span></div>
        <p className="rule-score">{language === "zh" ? "答對 +100 · 連對 5 題起 +200 · 答錯 −50" : "Correct +100 · From 5 in a row +200 · Mistake −50"}</p>
      </div>
      <div className="sheet-register">
        <div className={"field gatekeeper-field" + (errors.gatekeeper ? " is-invalid" : "")}>
          <span id="gatekeeper-label" className="field-label">
            {ui.gatekeeper} <span className="req">*</span>
            <span className="field-hint">{ui.chooseGatekeeper}</span>
          </span>
          <div className="gatekeeper-picks" role="group" aria-labelledby="gatekeeper-label">
            {GATEKEEPERS.map((name) => (
              <button
                key={name}
                type="button"
                className={"gatekeeper-pick" + (gatekeeperChoice === name ? " is-on" : "")}
                aria-pressed={gatekeeperChoice === name}
                onClick={() => {
                  setGatekeeperChoice(name);
                  onChange("gatekeeper", name);
                }}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className={"gatekeeper-pick" + (gatekeeperChoice === "__custom__" ? " is-on" : "")}
              aria-pressed={gatekeeperChoice === "__custom__"}
              onClick={() => {
                setGatekeeperChoice("__custom__");
                if (GATEKEEPERS.includes(player.gatekeeper)) onChange("gatekeeper", "");
              }}
            >
              {ui.customGatekeeper}
            </button>
          </div>
          {gatekeeperChoice === "__custom__" ? (
            <input
              id="gatekeeper-custom"
              name="gatekeeper"
              value={player.gatekeeper}
              maxLength={20}
              autoComplete="off"
              onChange={(e) => onChange("gatekeeper", e.target.value.slice(0, 20))}
              placeholder={ui.customGatekeeperPlaceholder}
              aria-label={ui.customGatekeeperPlaceholder}
            />
          ) : null}
          <span className="field-err">{validationText(errors.gatekeeper, language)}</span>
        </div>
        <div className="form-kicker">
          <div>
            <h2>{ui.officialEntry}<span>{language === "zh" ? "先練習，再挑戰" : "Warm up, then focus"}</span></h2>
            <p>{language === "zh" ? "填妥資料，先暖身 15 秒，再挑戰正式 60 秒。" : "Enter your details. Warm up for 15 seconds, then take the 60-second challenge."}</p>
          </div>
        </div>
        <div className={"field" + (errors.name ? " is-invalid" : "")}>
          <label htmlFor="name">
            {ui.name} <span className="req">*</span>
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            maxLength={20}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
            value={player.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder={ui.namePlaceholder}
          />
          <span id="name-error" className="field-err">{validationText(errors.name, language)}</span>
        </div>
        <div className={"field" + (errors.department ? " is-invalid" : "")}>
          <label htmlFor="department">
            {ui.department} <span className="req">*</span>
          </label>
          <select
            id="department"
            name="department"
            aria-invalid={Boolean(errors.department)}
            aria-describedby={errors.department ? "department-error" : undefined}
            value={player.department}
            onChange={(e) => onChange("department", e.target.value)}
          >
            <option value="">{ui.selectDepartment}</option>
            {DEPARTMENT_GROUPS.map((g) => (
              <optgroup key={g.college} label={collegeName(g.college, language)}>
                {g.items.map((d) => (
                  <option key={d} value={d}>
                    {departmentName(d, language)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span id="department-error" className="field-err">{validationText(errors.department, language)}</span>
        </div>
        <div className={"field" + (errors.grade ? " is-invalid" : "")}>
          <span id="grade-label" className="field-label">
            {ui.year} <span className="req">*</span>
          </span>
          <select
            id="grade"
            className="sr-only"
            aria-labelledby="grade-label"
            tabIndex={-1}
            aria-hidden="true"
            value={player.grade}
            onChange={(e) => onChange("grade", e.target.value)}
          >
            <option value="">{ui.selectYear}</option>
            {GRADE_LIST.map((g) => (
              <option key={g} value={g}>
                {gradeName(g, language)}
              </option>
            ))}
          </select>
          <div className="grade-picks" role="group" aria-labelledby="grade-label">
            {GRADE_LIST.map((g) => (
              <button
                key={g}
                type="button"
                className={"grade-pick" + (player.grade === g ? " is-on" : "")}
                data-grade={g}
                aria-pressed={player.grade === g}
                onClick={() => onChange("grade", g)}
              >
                {gradeName(g, language)}
              </button>
            ))}
          </div>
          <span className="field-err">{validationText(errors.grade, language)}</span>
        </div>
        <div className={"field" + (errors.phone ? " is-invalid" : "")}>
          <label htmlFor="phone">
            {ui.mobile} <span className="req">*</span>
          </label>
          <input
            id="phone"
            name="tel"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            maxLength={10}
            value={player.phone}
            onChange={(e) => onChange("phone", e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
            placeholder={ui.phonePlaceholder}
          />
          <span id="phone-error" className="field-err">{validationText(errors.phone, language)}</span>
        </div>
      </div>
      <div className="cta-dock">
        <button type="submit" className="cta" data-cta="official" disabled={busy}>
          {busy
            ? ui.preparing
            : official
              ? ui.officialStart
              : ui.practiceStartPrefix + settings.duration + ui.practiceStartSuffix}
        </button>
      </div>
    </form>
    {openAdmin ? <AdminLogin onClose={() => setOpenAdmin(false)} onSuccess={() => window.location.assign("/admin")} /> : null}
    </>
  );
}

function ResultScreen({
  language,
  onLanguage,
  player,
  game,
  save,
  onAgain,
  onContinue,
  onPracticeAgain,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  player: Player;
  game: ReturnType<typeof createLiveGame>;
  save: SaveKind;
  onAgain: () => void;
  onContinue: () => void;
  onPracticeAgain: () => void;
}) {
  const ui = TEXT[language];
  const payload = publicResult(game, player);
  const title = resultTitle(payload.title, language);
  const blurb = resultBlurb(payload.title, language, payload.duration, payload.blurb);
  const warmup = game.kind === "warmup";

  return (
    <section className="screen screen-result active">
      <div className="result-sheet" data-result="1">
        <div className="result-toolbar">
          <div />
          <LanguageToggle language={language} onChange={onLanguage} />
        </div>
        <div className="score-xl" data-result-score>
          {payload.score}
        </div>
        <h2 className="result-title">{warmup ? ui.warmupComplete : title}</h2>
        <p className="title-blurb">{warmup ? ui.warmupDescription : blurb}</p>
        <div className="result-meta">
          <div>
            <span>
              {ui.accuracy}
            </span>
            <strong>{payload.accuracy}%</strong>
          </div>
          <div>
            <span>
              {ui.bestCombo}
            </span>
            <strong>x{payload.maxCombo}</strong>
          </div>
          <div>
            <span>
              {ui.correct}
            </span>
            <strong>{payload.correct}</strong>
          </div>
          <div>
            <span>
              {ui.wrong}
            </span>
            <strong>{payload.wrong}</strong>
          </div>
        </div>
        {!warmup ? (
          <>
            <p className="save-note" data-save={save}>
              {saveText(save, language)}
            </p>
          </>
        ) : null}
        <button type="button" className="cta" onClick={warmup ? onContinue : onAgain}>
          {warmup ? ui.officialContinue : ui.tryAgain}
        </button>
        {warmup ? (
          <button type="button" className="cta secondary" onClick={onPracticeAgain}>
            {ui.warmupRetry}
          </button>
        ) : null}
        <button type="button" className="cta secondary" onClick={onAgain}>
          {ui.home}
        </button>
      </div>
    </section>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
    expo: "Tamkang University Zen Club · Club Expo",
    title: "Focus Challenge",
    factSeconds: "60 seconds",
    factInstruction: "Read the rule · tap the color",
    factPrize: "On-site bubble tea",
    officialEntry: "Official Entry",
    officialDescription:
      "Enter your details to play for 60 seconds. Winners are announced at the booth; scores are not published online.",
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
    officialStart: "Official entry · Start 60 seconds →",
    practiceStartPrefix: "Start ",
    practiceStartSuffix: "-second practice →",
    privacyOfficial:
      "Scores and prizes are never published online. Your phone number is used only to contact prize winners. Your information is used only for this event. Practice runs are not entered into the draw.",
    privacyPractice:
      "These practice settings are not eligible for the prize draw. Restore the official rules to enter.",
    guest: "Try without registering (no prize draw)",
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
    joinCopy:
      "Want to build focus and self-awareness? Come visit the Tamkang University Zen Club. Bubble-tea winners are announced on site; scores are not published online.",
  },
  zh: {
    expo: "淡江大學禪學社 · 社團博覽會",
    title: "專注力挑戰賽",
    factSeconds: "60 秒",
    factInstruction: "看指令選顏色",
    factPrize: "現場手搖杯",
    officialEntry: "正式參賽",
    officialDescription: "填資料開始 60 秒。得獎現場公布，網站不公開成績。",
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
    officialStart: "正式參賽，開始 60 秒 →",
    practiceStartPrefix: "開始 ",
    practiceStartSuffix: " 秒練習 →",
    privacyOfficial:
      "成績與得獎都不會在網站公開。電話只用來聯絡得獎。資料只用於本次活動。試玩不登記、不抽獎。",
    privacyPractice: "這次用的是練習設定，成績不會登記抽獎。要抽獎請先恢復正式規則。",
    guest: "只想試玩，不登記也不抽獎",
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
    joinCopy:
      "想更認識自己、練習專注與表達，歡迎來淡江大學禪學社坐坐。手搖杯得獎現場公布，網站不公開成績。",
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

const SPEED_COPY: Record<string, { en: string; zh: string; hintEn: string; hintZh: string }> = {
  slow: { en: "Slow", zh: "慢", hintEn: "Changes after each answer", hintZh: "每答一題換規則" },
  normal: {
    en: "Normal",
    zh: "一般",
    hintEn: "Changes after each answer",
    hintZh: "每答一題換規則",
  },
  fast: { en: "Fast", zh: "快", hintEn: "Changes after each answer", hintZh: "每答一題換規則" },
  rush: { en: "Rush", zh: "極快", hintEn: "Changes after each answer", hintZh: "每答一題換規則" },
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

function speedName(speed: string, language: Language) {
  const entry = SPEED_COPY[speed] ?? SPEED_COPY.normal;
  return language === "zh" ? entry.zh : entry.en;
}

function speedHint(speed: string, language: Language) {
  const entry = SPEED_COPY[speed] ?? SPEED_COPY.normal;
  return language === "zh" ? entry.hintZh : entry.hintEn;
}

function startModeName(id: string, language: Language) {
  if (language === "zh") {
    return START_MODE_OPTIONS.find((item) => item.id === id)?.label ?? id;
  }
  return (
    { meaning: "Word meaning", visual: "Ink color", random: "Random" }[
      id as "meaning" | "visual" | "random"
    ] ?? id
  );
}

function resultTitle(title: string, language: Language) {
  return language === "en" ? (TITLE_NAMES[title] ?? title) : title;
}

function resultBlurb(title: string, language: Language, duration: number, fallback: string) {
  if (language === "zh") return fallback;
  return (BLURBS_EN[title] ?? fallback).replace("60 seconds", String(duration) + " seconds");
}

function clubName(club: string, language: Language) {
  return language === "zh" ? club : "Tamkang University Zen Club";
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

function ZhHelper({ language, children }: { language: Language; children: ReactNode }) {
  return language === "en" ? <span className="zh-helper">{children}</span> : null;
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
        EN
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
  const [language, setLanguage] = useState<Language>("en");
  const [player, setPlayer] = useState<Player>(emptyPlayer);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(DEFAULT_SETTINGS.duration);
  const [mood, setMood] = useState<TurtleMood>("idle");
  const [pops, setPops] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [modePulse, setModePulse] = useState(0);
  const [save, setSave] = useState<SaveKind>("idle");
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

  const endGame = useCallback(() => {
    const g = gameRef.current;
    if (g.resultSubmitted) return;
    g.ended = true;
    g.resultSubmitted = true;
    const payload = publicResult(g, playerRef.current);
    setScreen("result");
    if (g.skipSave) {
      setSave("guest");
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
          setSave("fail");
          return;
        }
        if (d.sheetsOk) setSave("ok");
        else setSave("local");
      })
      .catch(() => {
        setSave("fail");
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
    let raf = 0;
    const loop = () => {
      const g = gameRef.current;
      const tick = tickGame(g);
      setRemaining(tick.remaining);
      if (timeNumRef.current) timeNumRef.current.textContent = String(Math.ceil(tick.remaining));
      if (timeRailRef.current) {
        timeRailRef.current.style.transform =
          "scaleX(" + Math.max(0, tick.remaining / (g.duration || 60)) + ")";
      }
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
    const nextPlayer = emptyPlayer();
    setPlayer(nextPlayer);
    playerRef.current = nextPlayer;
    setErrors({});
    gameRef.current = createLiveGame(Date.now(), { skipSave: true, settings });
    setRemaining(settings.duration);
    setPops([]);
    setSave("idle");
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
              language={language}
              onLanguage={setLanguage}
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
              <div
                className={"time-board" + (timeShow <= 10 ? " warn" : "")}
                role="timer"
                aria-label={language === "en" ? "Time left" : "剩餘秒數"}
              >
                <span>{TEXT[language].timeLeft}</span>
                <strong
                  data-time
                  ref={(el) => {
                    timeNumRef.current = el;
                  }}
                >
                  {timeShow}
                </strong>
              </div>
              <div className="game-stats">
                <div>
                  <span>{TEXT[language].score}</span>
                  <strong data-score>{g.score}</strong>
                </div>
                <div>
                  <span>{TEXT[language].combo}</span>
                  <strong data-combo>x{g.combo}</strong>
                </div>
              </div>
            </div>
            <div className={"time-rail" + (timeShow <= 10 ? " is-warn" : "")} aria-hidden="true">
              <i
                ref={(el) => {
                  timeRailRef.current = el;
                }}
                style={{ transform: "scaleX(" + timeRatio + ")" }}
              />
            </div>
            <div
              className={"mode-card mode-" + g.mode + (modePulse ? " switch" : "")}
              data-mode={g.mode}
              key={modePulse}
            >
              <LanguageToggle language={language} onChange={setLanguage} compact />
              <div className="flash" />
              <small>
                {g.mode === "meaning"
                  ? TEXT[language].meaningInstruction
                  : TEXT[language].visualInstruction}
              </small>
              <ZhHelper language={language}>
                {g.mode === "meaning" ? TEXT.zh.meaningInstruction : TEXT.zh.visualInstruction}
              </ZhHelper>
              <strong>
                {g.mode === "meaning" ? TEXT[language].meaningMode : TEXT[language].visualMode}
              </strong>
              <ZhHelper language={language}>
                {g.mode === "meaning" ? TEXT.zh.meaningMode : TEXT.zh.visualMode}
              </ZhHelper>
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
                  >
                    {colorName(c.id as ColorId, language)}
                  </button>
                ))}
              </div>
              <p className="keys-hint">{TEXT[language].keyHint}</p>
            </div>
          </section>
        ) : null}

        {screen === "result" ? (
          <ResultScreen
            language={language}
            onLanguage={setLanguage}
            player={player}
            game={g}
            save={save}
            club={club}
            onAgain={playAgain}
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
  onSettings,
  onChange,
  onStart,
  onTryPlay,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  player: Player;
  errors: Record<string, string | undefined>;
  busy: boolean;
  settings: GameSettings;
  onSettings: (next: Partial<GameSettings>) => void;
  onChange: (key: keyof Player, value: string) => void;
  onStart: () => void;
  onTryPlay: () => void;
}) {
  const ui = TEXT[language];
  const official = isOfficialSettings(settings);
  const [openSettings, setOpenSettings] = useState(false);
  const [gatekeeperChoice, setGatekeeperChoice] = useState(() =>
    GATEKEEPERS.includes(player.gatekeeper)
      ? player.gatekeeper
      : player.gatekeeper
        ? "__custom__"
        : "",
  );

  return (
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
      <figure className="scene-hero">
        <img
          src="/scene-hero.jpg"
          alt={
            language === "en"
              ? "Tamkang University Zen Club: turtle and students"
              : "淡江禪學社：龜龜與同學"
          }
          width="880"
          height="400"
          fetchPriority="high"
          decoding="async"
        />
        <figcaption className="scene-hero-overlay">
          <p className="eyebrow">{ui.expo}</p>
          <ZhHelper language={language}>{TEXT.zh.expo}</ZhHelper>
          <h1 className="hero-title">{ui.title}</h1>
          <ZhHelper language={language}>{TEXT.zh.title}</ZhHelper>
          <p className="hero-facts">
            <span>{ui.factSeconds}</span>
            <span>{ui.factInstruction}</span>
            <span>{ui.factPrize}</span>
          </p>
        </figcaption>
        <div className="register-language">
          <LanguageToggle language={language} onChange={onLanguage} />
        </div>
        <button
          type="button"
          className="gear-btn"
          aria-label={language === "en" ? "Open settings" : "開啟設定"}
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
            <h2>{ui.officialEntry}</h2>
            <ZhHelper language={language}>正式參賽</ZhHelper>
            <p>{official ? ui.officialDescription : ui.practiceDescription}</p>
            <ZhHelper language={language}>
              {official ? TEXT.zh.officialDescription : TEXT.zh.practiceDescription}
            </ZhHelper>
          </div>
        </div>
        <div className={"field gatekeeper-field" + (errors.gatekeeper ? " is-invalid" : "")}>
          <span id="gatekeeper-label" className="field-label">
            {ui.gatekeeper} <span className="req">*</span>
            <ZhHelper language={language}>關主</ZhHelper>
          </span>
          <p className="field-hint">{ui.chooseGatekeeper}</p>
          <div className="gatekeeper-picks" role="radiogroup" aria-labelledby="gatekeeper-label">
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
        <div className={"field" + (errors.name ? " is-invalid" : "")}>
          <label htmlFor="name">
            {ui.name} <span className="req">*</span>
            <ZhHelper language={language}>姓名</ZhHelper>
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={player.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder={ui.namePlaceholder}
          />
          <span className="field-err">{validationText(errors.name, language)}</span>
        </div>
        <div className={"field" + (errors.department ? " is-invalid" : "")}>
          <label htmlFor="department">
            {ui.department} <span className="req">*</span>
            <ZhHelper language={language}>科系</ZhHelper>
          </label>
          <select
            id="department"
            name="department"
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
          <span className="field-err">{validationText(errors.department, language)}</span>
        </div>
        <div className={"field" + (errors.grade ? " is-invalid" : "")}>
          <span id="grade-label" className="field-label">
            {ui.year} <span className="req">*</span>
            <ZhHelper language={language}>年級</ZhHelper>
          </span>
          <select
            id="grade"
            className="sr-only"
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
          <div className="grade-picks" role="radiogroup" aria-labelledby="grade-label">
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
                <ZhHelper language={language}>{gradeName(g, "zh")}</ZhHelper>
              </button>
            ))}
          </div>
          <span className="field-err">{validationText(errors.grade, language)}</span>
        </div>
        <div className={"field" + (errors.phone ? " is-invalid" : "")}>
          <label htmlFor="phone">
            {ui.mobile} <span className="req">*</span>
            <ZhHelper language={language}>電話</ZhHelper>
          </label>
          <input
            id="phone"
            name="tel"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            value={player.phone}
            onChange={(e) => onChange("phone", e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
            placeholder={ui.phonePlaceholder}
          />
          <span className="field-err">{validationText(errors.phone, language)}</span>
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
        <p className="privacy">{official ? ui.privacyOfficial : ui.privacyPractice}</p>
        <ZhHelper language={language}>
          {official ? TEXT.zh.privacyOfficial : TEXT.zh.privacyPractice}
        </ZhHelper>
        <button type="button" className="guest-link" data-cta="guest" onClick={onTryPlay}>
          {ui.guest}
        </button>
      </div>
      {openSettings ? (
        <SettingsSheet
          language={language}
          onLanguage={onLanguage}
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
        d="M19.4 12.9c.06-.3.1-.6.1-.9s-.04-.6-.1-.9l2-1.5-1.9-3.3-2.3.7c-.5-.4-1-.7-1.6-.9L15 3h-6l-.6 2.1c-.6.2-1.1.5-1.6.9l-2.3-.7L3.6 8.6l2 1.5c-.06.3-.1.6-.1.9s.04.6.1.9l-2 1.5 1.9 3.3 2.3-.7c.5.4 1.1.7 1.6.9L15 21h-6l-.6-2.1c-.6-.2-1.1-.5-1.6-.9l-2.3.7-1.9-3.3 2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsSheet({
  language,
  onLanguage,
  settings,
  official,
  onSettings,
  onClose,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  settings: GameSettings;
  official: boolean;
  onSettings: (next: Partial<GameSettings>) => void;
  onClose: () => void;
}) {
  const ui = TEXT[language];

  return (
    <div className="settings-mask" data-settings="1" onClick={onClose} role="presentation">
      <div
        className="settings-sheet"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h3 id="settings-title">{ui.settings}</h3>
          <ZhHelper language={language}>挑戰設定</ZhHelper>
          <LanguageToggle language={language} onChange={onLanguage} compact />
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label={language === "en" ? "Close settings" : "關閉設定"}
          >
            {ui.done}
          </button>
        </div>
        <SettingsPreview language={language} settings={settings} />
        <label className="slider-row" htmlFor="set-duration">
          <span>
            {ui.time}
            <ZhHelper language={language}>時間</ZhHelper>
          </span>
          <strong data-duration-value>
            {settings.duration} {ui.seconds}
            {settings.duration === 60 ? " · " + ui.official : ""}
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
        <div className="slider-ends">
          <span>
            {DURATION_MIN}
            {language === "en" ? "s" : "秒"}
          </span>
          <span>60{language === "en" ? "s" : "秒"}</span>
          <span>
            {DURATION_MAX}
            {language === "en" ? "s" : "秒"}
          </span>
        </div>
        <label className="slider-row" htmlFor="set-speed">
          <span>
            {ui.speed}
            <ZhHelper language={language}>速度</ZhHelper>
          </span>
          <strong data-speed-value>
            {speedName(settings.speed, language)} · {speedHint(settings.speed, language)}
          </strong>
        </label>
        <input
          id="set-speed"
          className="slider"
          type="range"
          min={0}
          max={SPEED_PRESETS.length - 1}
          step={1}
          value={Math.max(
            0,
            SPEED_PRESETS.findIndex((p) => p.id === settings.speed),
          )}
          data-speed-slider
          onChange={(e) => onSettings({ speed: SPEED_PRESETS[Number(e.target.value)]?.id })}
        />
        <div className="slider-ends">
          {SPEED_PRESETS.map((p) => (
            <span key={p.id}>
              {speedName(p.id, language)}
              <ZhHelper language={language}>{speedName(p.id, "zh")}</ZhHelper>
            </span>
          ))}
        </div>
        <p className="settings-label">
          {ui.startRule}
          <ZhHelper language={language}>起始規則</ZhHelper>
        </p>
        <div className="grade-picks" role="radiogroup" aria-label={ui.startRule}>
          {START_MODE_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={"grade-pick" + (settings.startMode === s.id ? " is-on" : "")}
              data-start-mode={s.id}
              aria-pressed={settings.startMode === s.id}
              onClick={() => onSettings({ startMode: s.id })}
            >
              {startModeName(s.id, language)}
              <ZhHelper language={language}>{startModeName(s.id, "zh")}</ZhHelper>
            </button>
          ))}
        </div>
        <div className="settings-toggles">
          <button
            type="button"
            className={"grade-pick" + (settings.sound ? " is-on" : "")}
            aria-pressed={settings.sound}
            data-sound={settings.sound ? "on" : "off"}
            onClick={() => onSettings({ sound: !settings.sound })}
          >
            {ui.sound} {settings.sound ? ui.on : ui.off}
          </button>
          <button
            type="button"
            className={"grade-pick" + (settings.vibrate ? " is-on" : "")}
            aria-pressed={settings.vibrate}
            data-vibrate={settings.vibrate ? "on" : "off"}
            onClick={() => onSettings({ vibrate: !settings.vibrate })}
          >
            {ui.vibration} {settings.vibrate ? ui.on : ui.off}
          </button>
        </div>
        {official ? (
          <p className="settings-note">
            {ui.officialRules}
            <ZhHelper language={language}>{TEXT.zh.officialRules}</ZhHelper>
          </p>
        ) : (
          <button
            type="button"
            className="settings-reset"
            onClick={() => onSettings(DEFAULT_SETTINGS)}
          >
            {ui.restoreOfficial}
            <ZhHelper language={language}>恢復正式規則</ZhHelper>
          </button>
        )}
      </div>
    </div>
  );
}

function SettingsPreview({ language, settings }: { language: Language; settings: GameSettings }) {
  const [q, setQ] = useState(() => nextQuestion(null));
  const [mode, setMode] = useState<"meaning" | "visual">(
    settings.startMode === "visual" ? "visual" : "meaning",
  );
  const [left, setLeft] = useState(settings.duration);
  const [pulse, setPulse] = useState(0);
  const startRef = useRef(Date.now());
  const ui = TEXT[language];

  useEffect(() => {
    startRef.current = Date.now();
    setLeft(settings.duration);
    if (settings.startMode === "visual" || settings.startMode === "meaning") {
      setMode(settings.startMode);
    }
  }, [settings.duration, settings.startMode]);

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
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [settings.duration]);

  return (
    <div className="settings-preview" data-preview="1">
      <div className="preview-hud">
        <span>{ui.preview}</span>
        <strong>
          {Math.ceil(left)}
          {language === "en" ? "s" : "秒"}
        </strong>
      </div>
      <div className={"preview-mode" + (pulse ? " switch" : "")} key={pulse}>
        {mode === "meaning" ? ui.meaningInstruction : ui.visualInstruction}
        <ZhHelper language={language}>
          {mode === "meaning" ? TEXT.zh.meaningInstruction : TEXT.zh.visualInstruction}
        </ZhHelper>
      </div>
      <div className="preview-word" style={{ color: q.visual.hex }}>
        {colorName(q.meaning.id as ColorId, language)}
      </div>
      <div className="preview-dots">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"preview-dot ans-" + c.id}
            aria-label={colorName(c.id as ColorId, language)}
            onClick={() => {
              setQ(nextQuestion(q));
              setMode((m) => (m === "meaning" ? "visual" : "meaning"));
              setPulse((n) => n + 1);
            }}
          >
            {colorName(c.id as ColorId, language)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultScreen({
  language,
  onLanguage,
  player,
  game,
  save,
  club,
  onAgain,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  player: Player;
  game: ReturnType<typeof createLiveGame>;
  save: SaveKind;
  club: string;
  onAgain: () => void;
}) {
  const ui = TEXT[language];
  const payload = publicResult(game, player);
  const title = resultTitle(payload.title, language);
  const blurb = resultBlurb(payload.title, language, payload.duration, payload.blurb);
  const zhBlurb = resultBlurb(payload.title, "zh", payload.duration, payload.blurb);
  const displayClub = clubName(club, language);

  return (
    <section className="screen screen-result active">
      <div className="result-sheet" data-result="1">
        <div className="result-toolbar">
          <div>
            <p className="eyebrow">{displayClub}</p>
            <ZhHelper language={language}>{club}</ZhHelper>
          </div>
          <LanguageToggle language={language} onChange={onLanguage} />
        </div>
        <div className="score-xl" data-result-score>
          {payload.score}
        </div>
        <h2 className="result-title">{title}</h2>
        <ZhHelper language={language}>{payload.title}</ZhHelper>
        <p className="title-blurb">{blurb}</p>
        <ZhHelper language={language}>{zhBlurb}</ZhHelper>
        <div className="result-meta">
          <div>
            <span>
              {ui.accuracy}
              <ZhHelper language={language}>正確率</ZhHelper>
            </span>
            <strong>{payload.accuracy}%</strong>
          </div>
          <div>
            <span>
              {ui.bestCombo}
              <ZhHelper language={language}>最高連擊</ZhHelper>
            </span>
            <strong>x{payload.maxCombo}</strong>
          </div>
          <div>
            <span>
              {ui.correct}
              <ZhHelper language={language}>答對</ZhHelper>
            </span>
            <strong>{payload.correct}</strong>
          </div>
          <div>
            <span>
              {ui.wrong}
              <ZhHelper language={language}>答錯</ZhHelper>
            </span>
            <strong>{payload.wrong}</strong>
          </div>
        </div>
        <p className="save-note" data-save={save}>
          {saveText(save, language)}
        </p>
        <p className="join-copy">
          {language === "en" ? ui.joinCopy : ui.joinCopy.replace("淡江大學禪學社", displayClub)}
          <ZhHelper language={language}>{TEXT.zh.joinCopy}</ZhHelper>
        </p>
        <button type="button" className="cta" onClick={onAgain}>
          {ui.tryAgain}
        </button>
        <button type="button" className="cta secondary" onClick={onAgain}>
          {ui.home}
        </button>
      </div>
    </section>
  );
}

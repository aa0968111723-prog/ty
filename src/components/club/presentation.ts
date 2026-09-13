import { COLORS, TUTORIAL_LESSONS, tutorialCorrectId } from "@/lib/club/runtime.mjs";

export type Screen = "register" | "tutorial" | "game" | "warmup-result" | "result";
export type Language = "en" | "zh";
export type Player = {
  name: string;
  department: string;
  grade: string;
  phone: string;
  gatekeeper: string;
};
export type GameSettings = {
  duration: number;
  switchMs: number;
  speed: string;
  comboEvery: number;
  tapLockMs: number;
  startMode: string;
  sound: boolean;
  vibrate: boolean;
};
export type ColorId = (typeof COLORS)[number]["id"];
export type SaveKind = "idle" | "ok" | "guest" | "local" | "fail";

export const TEXT = {
  en: {
    title: "Focus Challenge",
    factSeconds: "60 seconds",
    factInstruction: "Read the rule · tap the color",
    factPrize: "On-site bubble tea",
    officialEntry: "Official Entry",
    officialDescription:
      "Learn the two rules, try two practice taps, warm up for 15 seconds, then start a fresh 60-second challenge. Winners are announced at the booth; scores are not published online.",
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
    officialStart: "Start practice",
    howToTitle: "How to play",
    howToMeaningTitle: "Word meaning",
    howToMeaningHint: "Tap the color named by the word. Ignore the ink.",
    howToVisualTitle: "Ink color",
    howToVisualHint: "Tap the ink color. Ignore the word.",
    howToPick: "Tap",
    flowFill: "Your details",
    flowTutorial: "2 guided taps + 15s warm-up",
    flowOfficial: "Official 60 seconds",
    tutorialTitle: "Quick tutorial",
    tutorialProgress: "Question",
    tutorialCoachMeaning: "Look at the word. Tap that color.",
    tutorialCoachVisual: "Look at the ink. Tap that color.",
    tutorialWrong: "Check the task above, then try again.",
    tutorialNext: "A correct tap unlocks the next rule.",
    tutorialStartWarmup: "A correct tap starts the 15-second warm-up.",
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
      "先看懂兩種規則，再做兩題教學與 15 秒練習，然後開始全新的 60 秒正式挑戰。得獎現場公布，網站不公開成績。",
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
    officialStart: "開始練習",
    howToTitle: "怎麼玩",
    howToMeaningTitle: "字面意思",
    howToMeaningHint: "選文字寫的顏色，不要看墨水。",
    howToVisualTitle: "視覺顏色",
    howToVisualHint: "選字的實際顏色，不要看文字。",
    howToPick: "選",
    flowFill: "填資料",
    flowTutorial: "兩題教學 + 15 秒練習",
    flowOfficial: "正式 60 秒",
    tutorialTitle: "新手教學",
    tutorialProgress: "第",
    tutorialCoachMeaning: "先看文字，再選那個顏色。",
    tutorialCoachVisual: "先看墨水顏色，再選那個顏色。",
    tutorialWrong: "再看一次上面的任務。",
    tutorialNext: "選對才換下一題。",
    tutorialStartWarmup: "選對後開始 15 秒練習。",
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
    accuracy: "正確率",
    bestCombo: "最高連擊",
    correct: "答對",
    wrong: "答錯",
    saving: "成績傳送中…",
    tryAgain: "重新挑戰",
    home: "回首頁",
  },
} as const;

export const GATEKEEPERS = ["柏能", "安倢", "小哲", "振泰"];

export { TUTORIAL_LESSONS, tutorialCorrectId };

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

export function colorName(id: ColorId, language: Language) {
  return COLOR_NAMES[id][language];
}

export function gradeName(grade: string, language: Language) {
  return GRADE_NAMES[grade]?.[language] ?? grade;
}

export function collegeName(college: string, language: Language) {
  return COLLEGE_NAMES[college]?.[language] ?? college;
}

export function departmentName(department: string, language: Language) {
  if (language === "zh") return department;
  return DEPARTMENT_NAMES[department] ?? department;
}

export function resultTitle(title: string, language: Language) {
  return language === "en" ? (TITLE_NAMES[title] ?? title) : title;
}

export function resultBlurb(title: string, language: Language, duration: number, fallback: string) {
  if (language === "zh") return fallback;
  return (BLURBS_EN[title] ?? fallback).replace("60 seconds", String(duration) + " seconds");
}

export function saveText(kind: SaveKind, language: Language) {
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

export function validationText(message: string | undefined, language: Language) {
  if (!message) return "";
  return language === "zh" ? message : (VALIDATION_EN[message] ?? message);
}

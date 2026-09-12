import { type Language } from "./presentation";

export function LanguageToggle({
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

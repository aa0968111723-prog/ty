import { Trophy, Settings } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { LanguageToggle } from "./language-toggle";
import { TEXT, type Language } from "./presentation";

export function ClubHeader({
  language,
  onLanguage,
  onAdmin,
  active = "play",
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  onAdmin?: () => void;
  active?: "play" | "leaderboard";
}) {
  const zh = language === "zh";
  return (
    <header className="club-header">
      <a className="club-brand" href="/" aria-label={zh ? "首頁" : "Home"}>
        <BrandLogo />
        <span>{zh ? "淡江禪學社" : "TKU Zen Club"}</span>
      </a>
      <div className="header-actions">
        <a
          className={"gear-btn" + (active === "leaderboard" ? " is-current" : "")}
          href="/leaderboard"
          aria-current={active === "leaderboard" ? "page" : undefined}
          aria-label={TEXT[language].leaderboard}
          data-leaderboard-nav
        >
          <Trophy size={18} aria-hidden="true" />
        </a>
        <LanguageToggle language={language} onChange={onLanguage} />
        {onAdmin && (
          <button
            type="button"
            className="gear-btn"
            aria-label={zh ? "管理員登入" : "Administrator login"}
            data-admin-login
            onClick={onAdmin}
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}

import { Settings } from "lucide-react";
import { LanguageToggle } from "./language-toggle";
import { type Language } from "./presentation";

export function ClubHeader({
  language,
  onLanguage,
  onAdmin,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  onAdmin?: () => void;
}) {
  return (
    <header className="club-header">
      <a className="club-brand" href="/" aria-label={language === "zh" ? "首頁" : "Home"}>
        <img src="/club-icon-3d-192.png" width="44" height="44" alt="" />
        <span>{language === "zh" ? "淡江禪學社" : "TKU Zen Club"}</span>
      </a>
      <div className="header-actions">
        <LanguageToggle language={language} onChange={onLanguage} />
        {onAdmin && (
          <button
            type="button"
            className="gear-btn"
            aria-label={language === "zh" ? "管理員登入" : "Administrator login"}
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

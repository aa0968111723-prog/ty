import { createLiveGame, publicResult } from "@/lib/club/runtime.mjs";
import { ClubHeader } from "./club-header";
import { BrandLogo } from "./brand-logo";
import {
  TEXT,
  resultTitle,
  resultBlurb,
  saveText,
  type Language,
  type Player,
  type SaveKind,
} from "./presentation";

export function ResultScreen({
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
        <ClubHeader language={language} onLanguage={onLanguage} />
        <div className="result-content">
          <BrandLogo className="result-mascot" size={120} />
          <div className="score-xl" data-result-score>
            {payload.score}
          </div>
          <p className="score-label">{language === "zh" ? "本次分數" : "Your score"}</p>
          <h2 className="result-title">{warmup ? ui.warmupComplete : title}</h2>
          <p className="title-blurb">{warmup ? ui.warmupDescription : blurb}</p>
          <div className="result-meta">
            <div>
              <span>{ui.accuracy}</span>
              <strong>{payload.accuracy}%</strong>
            </div>
            <div>
              <span>{ui.bestCombo}</span>
              <strong>x{payload.maxCombo}</strong>
            </div>
            <div>
              <span>{ui.correct}</span>
              <strong>{payload.correct}</strong>
            </div>
            <div>
              <span>{ui.wrong}</span>
              <strong>{payload.wrong}</strong>
            </div>
          </div>
          {!warmup ? (
            <p className="save-note" data-save={save}>
              {saveText(save, language)}
            </p>
          ) : null}
          <div className="result-actions">
            <button type="button" className="cta" onClick={warmup ? onContinue : onAgain}>
              {warmup ? ui.officialContinue : ui.tryAgain}
            </button>
            {warmup ? (
              <button type="button" className="cta secondary" onClick={onPracticeAgain}>
                {ui.warmupRetry}
              </button>
            ) : (
              <a className="cta secondary" href="/leaderboard" data-result-leaderboard>
                {ui.viewLeaderboard}
              </a>
            )}
            <button type="button" className="cta secondary" onClick={onAgain}>
              {ui.home}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

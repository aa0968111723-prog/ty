import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LeaderboardBoard } from "@/components/club/leaderboard-board";
import { type Language } from "@/components/club/presentation";

export const Route = createFileRoute("/leaderboard")({
  ssr: false,
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const [language, setLanguage] = useState<Language>("zh");

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

  return <LeaderboardBoard language={language} onLanguage={setLanguage} />;
}

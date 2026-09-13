import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LeaderboardBoard, type LeaderboardScope, type PublicLeaderboard } from "@/components/club/leaderboard-board";
import { loadPublicLeaderboard } from "@/lib/club/leaderboard.mjs";
import { type Language } from "@/components/club/presentation";

function scopeFromLocation(location: { href?: string; search?: unknown }) {
  const href = typeof location.href === "string" ? location.href : "";
  try {
    const value = new URL(href, "http://club.invalid").searchParams.get("scope");
    if (value === "history" || value === "today") return value;
  } catch {
    /* ignore */
  }
  return "today";
}

export const Route = createFileRoute("/leaderboard")({
  loader: async ({ location }): Promise<PublicLeaderboard | null> => {
    try {
      const body = await loadPublicLeaderboard(scopeFromLocation(location));
      if (body.ok !== true || !Array.isArray(body.rows)) return null;
      return body as PublicLeaderboard;
    } catch {
      return null;
    }
  },
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const initial = Route.useLoaderData();
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

  return (
    <LeaderboardBoard
      language={language}
      onLanguage={setLanguage}
      initialScope={(initial?.scope === "history" ? "history" : "today") as LeaderboardScope}
      initialData={initial}
    />
  );
}

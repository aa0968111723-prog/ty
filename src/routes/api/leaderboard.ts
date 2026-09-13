import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleLeaderboard } = await import("@/lib/club/api.mjs");
  return handleLeaderboard(request);
});

export const Route = createFileRoute("/api/leaderboard")({
  server: { handlers: { GET: handle } },
});

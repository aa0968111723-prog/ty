import { createFileRoute } from "@tanstack/react-router";
import { handleLeaderboard } from "@/lib/club/api.mjs";

const handle = ({ request }: { request: Request }) => handleLeaderboard(request);

export const Route = createFileRoute("/api/leaderboard")({
  server: { handlers: { GET: handle } },
});

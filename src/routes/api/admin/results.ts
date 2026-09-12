import { createFileRoute } from "@tanstack/react-router";
import { handleAdminResults } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/results")({
  server: { handlers: { GET: ({ request }) => handleAdminResults(request) } },
});

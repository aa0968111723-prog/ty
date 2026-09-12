import { createFileRoute } from "@tanstack/react-router";
import { handleAdminSession } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/session")({
  server: { handlers: { GET: ({ request }) => handleAdminSession(request) } },
});

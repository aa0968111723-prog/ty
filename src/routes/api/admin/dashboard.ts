import { createFileRoute } from "@tanstack/react-router";
import { handleAdminDashboard } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/dashboard")({
  server: { handlers: { GET: ({ request }) => handleAdminDashboard(request) } },
});

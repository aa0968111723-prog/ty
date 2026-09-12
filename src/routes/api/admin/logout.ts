import { createFileRoute } from "@tanstack/react-router";
import { handleAdminLogout } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/logout")({
  server: { handlers: { POST: ({ request }) => handleAdminLogout(request) } },
});

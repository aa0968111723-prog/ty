import { createFileRoute } from "@tanstack/react-router";
import { handleAdminLogin } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/login")({
  server: { handlers: { POST: ({ request }) => handleAdminLogin(request) } },
});

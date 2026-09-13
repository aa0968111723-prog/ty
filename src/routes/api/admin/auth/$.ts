import { createFileRoute } from "@tanstack/react-router";
import { handleAdminAuth } from "@/lib/club/admin-auth.mjs";

export const Route = createFileRoute("/api/admin/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAdminAuth(request),
      POST: ({ request }) => handleAdminAuth(request),
    },
  },
});

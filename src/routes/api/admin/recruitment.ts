import { createFileRoute } from "@tanstack/react-router";
import { handleAdminRecruitment } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/recruitment")({
  server: {
    handlers: {
      GET: ({ request }) => handleAdminRecruitment(request),
      POST: ({ request }) => handleAdminRecruitment(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleAdminFormResponses } from "@/lib/club/admin.mjs";

export const Route = createFileRoute("/api/admin/form-responses")({
  server: { handlers: { GET: ({ request }) => handleAdminFormResponses(request) } },
});

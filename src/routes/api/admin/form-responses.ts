import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminFormResponses } = await import("@/lib/club/admin.mjs");
  return handleAdminFormResponses(request);
});

export const Route = createFileRoute("/api/admin/form-responses")({
  server: { handlers: { GET: handle } },
});

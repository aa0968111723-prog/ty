import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminResults } = await import("@/lib/club/admin.mjs");
  return handleAdminResults(request);
});

export const Route = createFileRoute("/api/admin/results")({
  server: { handlers: { GET: handle } },
});

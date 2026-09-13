import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminDashboard } = await import("@/lib/club/admin.mjs");
  return handleAdminDashboard(request);
});

export const Route = createFileRoute("/api/admin/dashboard")({
  server: { handlers: { GET: handle } },
});

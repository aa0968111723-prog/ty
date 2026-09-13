import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminSession } = await import("@/lib/club/admin.mjs");
  return handleAdminSession(request);
});

export const Route = createFileRoute("/api/admin/session")({
  server: { handlers: { GET: handle } },
});

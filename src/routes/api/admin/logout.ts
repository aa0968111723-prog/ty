import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminLogout } = await import("@/lib/club/admin.mjs");
  return handleAdminLogout(request);
});

export const Route = createFileRoute("/api/admin/logout")({
  server: { handlers: { POST: handle } },
});

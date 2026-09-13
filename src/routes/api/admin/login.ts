import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminLogin } = await import("@/lib/club/admin.mjs");
  return handleAdminLogin(request);
});

export const Route = createFileRoute("/api/admin/login")({
  server: { handlers: { POST: handle } },
});

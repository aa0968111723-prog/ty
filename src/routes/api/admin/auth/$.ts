import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminAuth } = await import("@/lib/club/admin-auth.mjs");
  return handleAdminAuth(request);
});

export const Route = createFileRoute("/api/admin/auth/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});

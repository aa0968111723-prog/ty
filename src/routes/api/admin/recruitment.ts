import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleAdminRecruitment } = await import("@/lib/club/admin.mjs");
  return handleAdminRecruitment(request);
});

export const Route = createFileRoute("/api/admin/recruitment")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});

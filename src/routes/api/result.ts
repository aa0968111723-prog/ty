import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleResult } = await import("@/lib/club/api.mjs");
  return handleResult(request);
});

export const Route = createFileRoute("/api/result")({
  server: { handlers: { POST: handle } },
});

import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async () => {
  const { handleHealth } = await import("@/lib/club/api.mjs");
  return handleHealth();
});

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: handle } },
});

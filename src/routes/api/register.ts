import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handle = createServerOnlyFn(async ({ request }: { request: Request }) => {
  const { handleRegister } = await import("@/lib/club/api.mjs");
  return handleRegister(request);
});

export const Route = createFileRoute("/api/register")({
  server: { handlers: { POST: handle } },
});

import { createFileRoute } from "@tanstack/react-router";
import { handleResult } from "@/lib/club/api.mjs";

const handle = ({ request }: { request: Request }) => handleResult(request);

export const Route = createFileRoute("/api/result")({
  server: { handlers: { POST: handle } },
});

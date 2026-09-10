import { createFileRoute } from "@tanstack/react-router";
import { handleRegister } from "@/lib/club/api.mjs";

const handle = ({ request }: { request: Request }) => handleRegister(request);

export const Route = createFileRoute("/api/register")({
  server: { handlers: { POST: handle } },
});

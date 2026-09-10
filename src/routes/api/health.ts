import { createFileRoute } from "@tanstack/react-router";
import { handleHealth } from "@/lib/club/api.mjs";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => handleHealth(),
    },
  },
});

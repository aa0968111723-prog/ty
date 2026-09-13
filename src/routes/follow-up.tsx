import { createFileRoute } from "@tanstack/react-router";
import { RecruiterQuickfill } from "@/components/club/recruiter-quickfill";
import "@/admin.css";

export const Route = createFileRoute("/follow-up")({
  head: () => ({
    meta: [
      { title: "接引人快速填表｜淡江大學禪學社" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RecruiterQuickfillPage,
});

function RecruiterQuickfillPage() {
  return (
    <main className="admin-page quickfill-shell">
      <RecruiterQuickfill />
    </main>
  );
}

import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "頁面暫時無法顯示，請重新整理後再試一次。";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const detail = errorMessage(error);
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">發生問題</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        {FALLBACK_MESSAGE}
      </p>
      {detail && detail !== FALLBACK_MESSAGE ? (
        <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">{detail}</p>
      ) : null}
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        onClick={() => window.location.reload()}
      >
        重新整理
      </button>
    </main>
  );
}

import { useEffect, useState } from "react";
import { OFFICIAL_RECRUITERS, readStoredRecruiter } from "@/lib/club/recruitment-prefill.mjs";

export function useStoredRecruiter() {
  const [recruiter, setRecruiter] = useState("");
  const [customRecruiter, setCustomRecruiter] = useState("");
  useEffect(() => {
    const stored = readStoredRecruiter();
    if (OFFICIAL_RECRUITERS.includes(stored)) setRecruiter(stored);
    else if (stored) {
      setRecruiter("其他");
      setCustomRecruiter(stored);
    }
  }, []);
  return {
    recruiter,
    customRecruiter,
    officialRecruiter: recruiter === "其他" ? customRecruiter.trim() : recruiter,
    setPair: (next: string, custom: string) => {
      setRecruiter(next);
      setCustomRecruiter(custom);
    },
  };
}

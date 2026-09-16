import { UserRound } from "lucide-react";
import {
  OFFICIAL_RECRUITERS,
  rememberStoredRecruiter,
} from "@/lib/club/recruitment-prefill.mjs";

export function PartnerPicker({
  recruiter,
  customRecruiter,
  onChange,
  compact = false,
}: {
  recruiter: string;
  customRecruiter: string;
  onChange: (recruiter: string, custom: string) => void;
  compact?: boolean;
}) {
  const official = recruiter === "其他" ? customRecruiter.trim() : recruiter;
  return (
    <section className={`admin-panel partner-picker${compact ? " is-compact" : ""}`} aria-label="這位有緣人的接引人">
      <h2>
        <UserRound size={18} aria-hidden="true" />
        這位有緣人的接引人
      </h2>
      <div className="quickfill-partners">
        {OFFICIAL_RECRUITERS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={recruiter === name}
            onClick={() => {
              onChange(name, "");
              rememberStoredRecruiter(name);
            }}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={recruiter === "其他"}
          onClick={() => onChange("其他", customRecruiter)}
        >
          其他
        </button>
      </div>
      {recruiter === "其他" ? (
        <label>
          接引人姓名
          <input
            aria-label="其他接引人姓名"
            value={customRecruiter}
            maxLength={20}
            onChange={(event) => {
              onChange("其他", event.target.value);
              rememberStoredRecruiter(event.target.value.trim());
            }}
          />
        </label>
      ) : null}
      {official ? <p className="admin-caption">目前負責接引：{official}</p> : null}
    </section>
  );
}

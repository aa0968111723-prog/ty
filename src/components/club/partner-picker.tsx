import { useState } from "react";
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
  collapseWhenSelected = false,
}: {
  recruiter: string;
  customRecruiter: string;
  onChange: (recruiter: string, custom: string) => void;
  compact?: boolean;
  collapseWhenSelected?: boolean;
}) {
  const official = recruiter === "其他" ? customRecruiter.trim() : recruiter;
  const [expanded, setExpanded] = useState(() => !collapseWhenSelected || !official);
  const collapsed = collapseWhenSelected && Boolean(official) && !expanded;

  function pick(name: string, custom = "") {
    onChange(name, custom);
    if (name && name !== "其他") rememberStoredRecruiter(name);
    if (collapseWhenSelected && name && name !== "其他") setExpanded(false);
  }

  if (collapsed) {
    return (
      <section className="admin-panel partner-picker is-compact" aria-label="這位有緣人的接引人">
        <div className="partner-picked">
          <p>
            <span>這位有緣人的接引人</span>
            <strong>{official}</strong>
          </p>
          <button type="button" onClick={() => setExpanded(true)}>
            更換
          </button>
        </div>
      </section>
    );
  }
  if (compact) {
    return (
      <section className="admin-panel partner-picker is-compact" aria-label="這位有緣人的接引人">
        <label>
          這位有緣人的接引人
          <select
            aria-label="這位有緣人的接引人"
            value={recruiter}
            onChange={(event) => {
              const next = event.target.value;
              onChange(next, next === "其他" ? customRecruiter : "");
              if (next && next !== "其他") rememberStoredRecruiter(next);
            }}
          >
            <option value="">先選接引人</option>
            {OFFICIAL_RECRUITERS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            <option value="其他">其他</option>
          </select>
        </label>
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
        {official ? <p className="admin-caption">目前負責接引：{official} · 遊戲關主另計</p> : null}
      </section>
    );
  }
  return (
    <section className="admin-panel partner-picker" aria-label="這位有緣人的接引人">
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
            onClick={() => pick(name)}
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

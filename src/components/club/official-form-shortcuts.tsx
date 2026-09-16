import { ExternalLink } from "lucide-react";
import {
  OFFICIAL_FORM_EDIT_URL,
  OFFICIAL_VIEWFORM_URL,
} from "@/lib/club/recruitment-prefill.mjs";

export function OfficialFormShortcuts({
  prefillUrl,
}: {
  prefillUrl?: string;
}) {
  return (
    <div className="official-form-shortcuts" aria-label="快捷開啟正式表單">
      <a
        className="quickfill-google"
        href={prefillUrl || OFFICIAL_VIEWFORM_URL}
        target="_blank"
        rel="noreferrer"
        data-official-form="open-form"
      >
        開啟正式招生表單 <ExternalLink size={16} aria-hidden="true" />
      </a>
      <a
        className="quickfill-google"
        href={OFFICIAL_FORM_EDIT_URL}
        target="_blank"
        rel="noreferrer"
        data-official-form="open-backoffice"
      >
        查看招生表單後台 <ExternalLink size={16} aria-hidden="true" />
      </a>
    </div>
  );
}

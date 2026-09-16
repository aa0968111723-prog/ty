import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import { officialFormUrl, visibleStaffNote } from "@/lib/club/recruitment-prefill.mjs";

export type RecruitmentProfile = {
  personKey: string;
  name: string;
  phone: string;
  department: string;
  grade: string;
  gameGatekeeper: string;
  gameCompletedAt?: string;
  score?: number;
  title?: string;
  pending?: boolean;
  recruiters?: string;
  recruiterList?: string[];
  recruitedAt?: string;
  submittedAt?: string;
  activity?: string;
  activityList?: string[];
  joined?: string;
  depositPaid?: string;
  depositAmount?: string;
  birthday?: string;
  note?: string;
  studentId?: string;
  interest?: string;
  prefillUrl?: string;
  followUpPath?: string;
  needsConfirmation?: boolean;
  confirmationReason?: string;
  submissionId?: string;
  timeline?: Array<{ at: string; kind: string; title: string; detail: string }>;
};

function clock(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ConfirmMark({
  show,
  reason,
}: {
  show?: boolean;
  reason?: string;
}) {
  if (!show) return null;
  return (
    <p className="admin-confirm" role="status">
      <span className="admin-badge is-confirm">需要確認</span>
      {reason || "同名或同電話，請先核對是不是同一人"}
    </p>
  );
}

export function RecruitmentProfileSheet({
  profile,
  recruiter = "",
  onClose,
}: {
  profile: RecruitmentProfile | null;
  recruiter?: string;
  onClose: () => void;
}) {
  const formUrl = profile
    ? officialFormUrl({
      ...profile,
      completedAt: profile.gameCompletedAt,
    }, recruiter || profile.recruiterList?.[0] || "")
    || profile.prefillUrl
    || ""
    : "";
  return (
    <Dialog.Root open={Boolean(profile)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-overlay" />
        <Dialog.Content className="admin-more-dialog recruitment-sheet" aria-describedby={undefined}>
          <Dialog.Title>{profile?.name || "同學"}</Dialog.Title>
          <p className="admin-caption">
            {profile?.department || "科系未填"} · {profile?.grade || "年級未填"} · {profile?.phone || "電話未填"}
          </p>
          <ConfirmMark show={profile?.needsConfirmation} reason={profile?.confirmationReason} />
          <Dialog.Close className="admin-close" aria-label="關閉">
            <X size={20} />
          </Dialog.Close>
          <dl className="recruitment-identity">
            <div><dt>遊戲關主</dt><dd>{profile?.gameGatekeeper || "未填"}</dd></div>
            <div><dt>正式接引人</dt><dd>{profile?.recruiters || "尚未填表"}</dd></div>
            <div><dt>活動報名</dt><dd>{profile?.activityList?.join("、") || profile?.activity || "尚未填"}</dd></div>
            <div><dt>入社</dt><dd>{profile?.joined || "尚未填"}</dd></div>
            <div><dt>保證金</dt><dd>{profile?.depositPaid || "尚未填"}{profile?.depositAmount ? ` · ${profile.depositAmount}` : ""}</dd></div>
            <div><dt>學號</dt><dd>{profile?.studentId || "尚未填"}</dd></div>
            <div><dt>生日</dt><dd>{profile?.birthday || "尚未填"}</dd></div>
            <div><dt>備註</dt><dd>{visibleStaffNote(profile?.note) || "尚未填"}</dd></div>
          </dl>
          {profile ? (
            <div className="recruitment-sheet-actions">
              {profile.pending ? (
                <a
                  className="admin-primary"
                  href={profile.followUpPath || `/follow-up?personKey=${encodeURIComponent(profile.personKey)}`}
                >
                  填寫正式資料
                </a>
              ) : null}
              {formUrl ? (
                <a
                  className="admin-primary"
                  href={formUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-prefill="open-form"
                >
                  開啟正式招生表單 <ExternalLink size={16} />
                </a>
              ) : null}
              <a
                className="quickfill-google"
                href="/admin?view=form"
                target="_blank"
                rel="noreferrer"
                data-prefill="open-backoffice"
              >
                查看招生表單後台 <ExternalLink size={16} />
              </a>
            </div>
          ) : null}
          <ol className="recruitment-timeline">
            {(profile?.timeline || []).length ? (
              profile?.timeline?.map((item, index) => (
                <li key={`${item.kind}-${index}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>{clock(item.at)}</small>
                </li>
              ))
            ) : (
              <li>
                <strong>尚無時間線</strong>
                <span>只顯示已發生的真實紀錄</span>
              </li>
            )}
          </ol>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

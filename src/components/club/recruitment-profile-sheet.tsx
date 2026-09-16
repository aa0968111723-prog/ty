import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { OfficialFormShortcuts } from "./official-form-shortcuts";
import { IDENTITY_CONFIRM_LABEL, needsIdentityConfirm } from "@/lib/club/recruitment-identity.mjs";

export type RecruitmentProfile = {
  personKey: string;
  name: string;
  phone: string;
  department: string;
  grade: string;
  gameGatekeeper: string;
  gameCompletedAt?: string;
  completedAt?: string;
  score?: number;
  title?: string;
  pending?: boolean;
  needsReview?: boolean;
  handled?: boolean;
  recruiters?: string;
  recruiterList?: string[];
  recruitedAt?: string;
  submittedAt?: string;
  activity?: string;
  events?: string[];
  joined?: string;
  depositPaid?: string;
  depositAmount?: string;
  birthday?: string;
  note?: string;
  studentId?: string;
  interest?: string;
  prefillUrl?: string;
  submissionId?: string;
  status?: string;
  timeline?: Array<{ at: string; kind: string; title: string; detail: string }>;
};

function redactNote(value?: string) {
  return String(value || "")
    .replace(/submissionId[：:]\s*[0-9a-f-]{8,}/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

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

function handlingStatus(profile?: RecruitmentProfile | null) {
  if (profile?.handled) return "已處理";
  if (profile?.needsReview) return "需確認";
  if (profile?.pending) return "待處理";
  return "已填正式資料";
}

export function RecruitmentProfileSheet({
  profile,
  onClose,
}: {
  profile: RecruitmentProfile | null;
  onClose: () => void;
}) {
  const gameTime = clock(profile?.gameCompletedAt || profile?.completedAt);
  return (
    <Dialog.Root open={Boolean(profile)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-overlay" />
        <Dialog.Content className="admin-more-dialog recruitment-sheet" aria-describedby={undefined}>
          <Dialog.Title>{profile?.name || "同學"}</Dialog.Title>
          {needsIdentityConfirm(profile?.status) ? (
            <p className="admin-caption war-conflict" role="status">
              {IDENTITY_CONFIRM_LABEL} · 姓名或電話與其他資料重疊，不會自動合併。
            </p>
          ) : null}
          <p className="admin-caption">
            {profile?.department || "科系未填"} · {profile?.grade || "年級未填"} · {profile?.phone || "電話未填"}
          </p>
          <Dialog.Close className="admin-close" aria-label="關閉">
            <X size={20} />
          </Dialog.Close>
          <dl className="recruitment-identity" data-profile-fields="basic">
            <div><dt>姓名</dt><dd>{profile?.name || "未填"}</dd></div>
            <div><dt>科系系級</dt><dd>{profile?.department || "科系未填"} · {profile?.grade || "年級未填"}</dd></div>
            <div><dt>電話</dt><dd>{profile?.phone || "電話未填"}</dd></div>
            <div><dt>遊戲完成時間</dt><dd>{gameTime || "未填"}</dd></div>
            <div><dt>遊戲關主</dt><dd>{profile?.gameGatekeeper || "未填"}</dd></div>
            <div><dt>正式招生接引人</dt><dd>{profile?.recruiters || "尚未填表"}</dd></div>
            <div><dt>活動</dt><dd>{profile?.activity || "尚未填"}</dd></div>
            <div><dt>入社</dt><dd>{profile?.joined || "尚未填"}</dd></div>
            <div><dt>保證金</dt><dd>{profile?.depositPaid || "尚未填"}{profile?.depositAmount ? ` · ${profile.depositAmount}` : ""}</dd></div>
            <div><dt>學號</dt><dd>{profile?.studentId || "尚未填"}</dd></div>
            <div><dt>生日</dt><dd>{profile?.birthday || "尚未填"}</dd></div>
            <div><dt>備註</dt><dd>{redactNote(profile?.note) || "尚未填"}</dd></div>
          </dl>
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
          {profile?.pending ? (
            <a className="admin-primary" href={`/follow-up?personKey=${encodeURIComponent(profile.personKey)}`}>
              填寫正式資料
            </a>
          ) : null}
          <OfficialFormShortcuts prefillUrl={profile?.prefillUrl} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

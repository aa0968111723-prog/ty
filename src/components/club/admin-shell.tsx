import { useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Radio,
  ClipboardList,
  Users,
  Trophy,
  History,
  Sheet,
  Settings,
  Pin,
  MoreHorizontal,
  LogOut,
  Shield,
  Medal,
  X,
} from "lucide-react";
import { OfficialFormShortcuts } from "./official-form-shortcuts";

export type AdminView =
  | "recruitment"
  | "pending"
  | "roster"
  | "contacts"
  | "results"
  | "podium"
  | "history"
  | "leaders"
  | "system"
  | "pinned"
  | "security"
  | "overview";

const primaryNav = [
  { id: "recruitment" as const, label: "今日招生戰情", mobile: "戰情", shortcut: "today" },
  { id: "pending" as const, label: "待處理", mobile: "待處理", shortcut: "pending" },
  { id: "roster" as const, label: "名單", mobile: "名單", shortcut: "contacts" },
];

const moreNav = [
  { id: "podium" as const, label: "今日排行榜", mobile: "今日榜", icon: Trophy, shortcut: "ranking" },
  { id: "history" as const, label: "歷史排行榜", mobile: "歷史榜", icon: History, shortcut: "history" },
  { id: "contacts" as const, label: "表單資料", mobile: "表單", icon: Sheet, shortcut: "form" },
  { id: "system" as const, label: "同步狀態", mobile: "同步", icon: Settings, shortcut: "sync" },
  { id: "security" as const, label: "系統設定", mobile: "設定", icon: Shield, shortcut: "security" },
  { id: "pinned" as const, label: "我的釘選", mobile: "釘選", icon: Pin, shortcut: "pinned" },
  { id: "results" as const, label: "比賽成績", mobile: "成績", icon: Medal, shortcut: "results" },
];

const primaryIcons = {
  recruitment: Radio,
  pending: ClipboardList,
  roster: Users,
};

export function AdminShell({
  view,
  forms,
  onNavigate,
  onLogout,
  children,
}: {
  view: AdminView;
  forms: boolean;
  onNavigate: (view: AdminView, shortcut: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreNav.some((item) => item.id === view) || forms;
  const itemButton = (
    id: AdminView,
    label: string,
    shortcut: string,
    Icon: typeof Radio,
    extraClass?: string,
  ) => (
    <button
      key={shortcut}
      className={extraClass}
      aria-current={view === id && (id !== "contacts" || forms === (shortcut === "form")) ? "page" : undefined}
      onClick={() => {
        onNavigate(id, shortcut);
        setMoreOpen(false);
      }}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <BrandLogo />
          <span>
            淡江禪學社<small>招生戰情後台</small>
          </span>
        </a>
        <p className="admin-nav-label">工作空間</p>
        <nav aria-label="後台導覽">
          {primaryNav.map((item) =>
            itemButton(item.id, item.label, item.shortcut, primaryIcons[item.id]),
          )}
        </nav>
        <p className="admin-nav-label">更多</p>
        <nav aria-label="更多後台導覽">
          {moreNav.map((item) => itemButton(item.id, item.label, item.shortcut, item.icon))}
        </nav>
        <div className="admin-sidebar-footer">
          <span>現場工作人員</span>
          <button className="admin-logout" onClick={onLogout}>
            <LogOut size={18} />
            登出
          </button>
        </div>
      </aside>
      <div className="admin-mobile-top">
        <a className="club-brand" href="/">
          <BrandLogo size={40} />
          淡江禪學社
        </a>
        <span>招生戰情</span>
      </div>
      <div className="admin-content">{children}</div>
      <nav className="admin-bottom-nav" aria-label="手機後台導覽">
        {primaryNav.map((item) =>
          itemButton(item.id, item.mobile, item.shortcut, primaryIcons[item.id]),
        )}
        <button
          type="button"
          aria-label="更多"
          aria-expanded={moreOpen}
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={20} />
          <span>更多</span>
        </button>
      </nav>
      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="admin-overlay" />
          <Dialog.Content className="admin-more-dialog">
            <Dialog.Title>更多</Dialog.Title>
            <Dialog.Description>排行榜、表單與系統</Dialog.Description>
            <Dialog.Close className="admin-close" aria-label="關閉更多">
              <X size={20} />
            </Dialog.Close>
            <OfficialFormShortcuts />
            <nav aria-label="更多後台導覽">
              {moreNav.map((item) => itemButton(item.id, item.label, item.shortcut, item.icon))}
            </nav>
            <button className="admin-logout" onClick={onLogout}>
              <LogOut size={18} />
              登出
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

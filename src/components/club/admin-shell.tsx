import { useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Radio,
  ClipboardPen,
  Users,
  Trophy,
  Medal,
  Sheet,
  Settings,
  Pin,
  MoreHorizontal,
  LogOut,
  Shield,
  X,
} from "lucide-react";

export type AdminView =
  | "recruitment"
  | "queue"
  | "roster"
  | "pinned"
  | "podium"
  | "history"
  | "forms"
  | "system"
  | "security"
  | "overview"
  | "contacts"
  | "results"
  | "leaders";

const primary = [
  { id: "recruitment", label: "今日招生戰情", mobile: "戰情", icon: Radio, shortcut: "today" },
  { id: "queue", label: "待處理", mobile: "待處理", icon: ClipboardPen, shortcut: "queue" },
  { id: "roster", label: "名單", mobile: "名單", icon: Users, shortcut: "contacts" },
] as const;

const moreItems = [
  { id: "pinned", label: "我的釘選", mobile: "釘選", icon: Pin, shortcut: "pinned" },
  { id: "podium", label: "今日排行榜", mobile: "今日榜", icon: Trophy, shortcut: "ranking" },
  { id: "history", label: "歷史排行榜", mobile: "歷史榜", icon: Medal, shortcut: "history" },
  { id: "forms", label: "表單資料", mobile: "表單", icon: Sheet, shortcut: "form" },
  { id: "system", label: "同步狀態", mobile: "同步", icon: Settings, shortcut: "sync" },
  { id: "security", label: "系統設定", mobile: "設定", icon: Shield, shortcut: "security" },
] as const;

const moreViewIds = moreItems.map((item) => item.id);

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
  const active = (id: AdminView, shortcut: string) =>
    view === id || (id === "forms" && (view === "contacts" || forms) && shortcut === "form")
    || (id === "roster" && view === "contacts" && shortcut === "contacts" && !forms);
  const renderItems = (items: typeof primary | typeof moreItems) =>
    items.map(({ id, label, mobile, icon: Icon, shortcut }) => (
      <button
        key={shortcut}
        aria-current={active(id, shortcut) ? "page" : undefined}
        onClick={() => {
          onNavigate(id, shortcut);
          setMoreOpen(false);
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="admin-nav-full">{label}</span>
        <span className="admin-nav-short">{mobile}</span>
      </button>
    ));
  const moreCurrent = moreViewIds.includes(view as (typeof moreViewIds)[number]) || forms;
  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <BrandLogo />
          <span>
            淡江禪學社<small>招生工作台</small>
          </span>
        </a>
        <p className="admin-nav-label">主要入口</p>
        <nav aria-label="後台導覽">{renderItems(primary)}</nav>
        <p className="admin-nav-label">更多</p>
        <nav aria-label="更多後台導覽">{renderItems(moreItems)}</nav>
        <div className="admin-sidebar-footer">
          <span>現場工作人員</span>
          <button className="admin-logout" onClick={onLogout}>
            <LogOut size={18} />
            登出
          </button>
        </div>
      </aside>
      <div className="admin-mobile-top">
        <a className="club-brand" href="/" aria-label="淡江禪學社首頁">
          <BrandLogo size={44} />
          淡江禪學社
        </a>
        <span>招生工作台</span>
      </div>
      <div className="admin-content">{children}</div>
      <nav className="admin-bottom-nav" aria-label="手機後台導覽">
        {primary.map(({ id, mobile, icon: Icon, shortcut }) => (
          <button
            key={shortcut}
            aria-current={active(id, shortcut) ? "page" : undefined}
            onClick={() => onNavigate(id, shortcut)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{mobile}</span>
          </button>
        ))}
        <button
          aria-label="更多"
          aria-expanded={moreOpen}
          aria-current={moreCurrent ? "page" : undefined}
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
            <Dialog.Description>排行榜、表單資料與系統</Dialog.Description>
            <Dialog.Close className="admin-close" aria-label="關閉更多">
              <X size={20} />
            </Dialog.Close>
            <nav aria-label="更多後台導覽">{renderItems(moreItems)}</nav>
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

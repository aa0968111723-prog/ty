import { useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Radio,
  ClipboardList,
  Users,
  MoreHorizontal,
  LogOut,
  Trophy,
  History,
  Sheet,
  RefreshCw,
  Settings,
  Pin,
  X,
} from "lucide-react";

export type AdminView =
  | "overview"
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
  | "security";

const primaryNav = [
  { id: "recruitment", label: "戰情", shortcut: "today", icon: Radio },
  { id: "pending", label: "待處理", shortcut: "pending", icon: ClipboardList },
  { id: "roster", label: "名單", shortcut: "roster", icon: Users },
] as const;

const moreNav = [
  { id: "podium", label: "今日排行榜", shortcut: "today-board", icon: Trophy },
  { id: "history", label: "歷史排行榜", shortcut: "history-board", icon: History },
  { id: "contacts", label: "表單資料", shortcut: "form", icon: Sheet },
  { id: "system", label: "同步狀態", shortcut: "sync", icon: RefreshCw },
  { id: "security", label: "系統設定", shortcut: "security", icon: Settings },
  { id: "pinned", label: "我的釘選", shortcut: "pinned", icon: Pin },
] as const;

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
  const moreActive = moreOpen || moreNav.some(({ id, shortcut }) =>
    view === id && (id !== "contacts" || forms === (shortcut === "form")),
  );
  const renderItem = (
    item: (typeof primaryNav)[number] | (typeof moreNav)[number],
    extraClass?: string,
  ) => (
    <button
      key={item.shortcut}
      className={extraClass}
      aria-current={
        view === item.id && (item.id !== "contacts" || forms === (item.shortcut === "form"))
          ? "page"
          : undefined
      }
      onClick={() => {
        onNavigate(item.id, item.shortcut);
        setMoreOpen(false);
      }}
    >
      <item.icon size={18} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <BrandLogo />
          <span>
            淡江禪學社<small>招生戰情</small>
          </span>
        </a>
        <p className="admin-nav-label">夥伴入口</p>
        <nav aria-label="後台導覽">
          {primaryNav.map((item) => renderItem(item))}
          <button
            type="button"
            aria-current={moreActive ? "page" : undefined}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
            <span>更多</span>
          </button>
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
        {primaryNav.map((item) => renderItem(item))}
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
            <nav aria-label="更多後台導覽">{moreNav.map((item) => renderItem(item))}</nav>
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

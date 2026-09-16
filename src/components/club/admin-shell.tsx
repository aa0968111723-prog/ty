import { useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ClipboardList,
  Flag,
  History,
  LogOut,
  Medal,
  MoreHorizontal,
  Pin,
  Radio,
  Settings,
  Shield,
  Sheet,
  Trophy,
  Users,
  X,
} from "lucide-react";

export type AdminView =
  | "recruitment"
  | "pending"
  | "roster"
  | "contacts"
  | "results"
  | "podium"
  | "leaders"
  | "system"
  | "pinned"
  | "security"
  | "overview";

type NavItem = {
  id: AdminView;
  label: string;
  mobile: string;
  icon: typeof Radio;
  shortcut: string;
  href?: string;
};

const primaryNav: NavItem[] = [
  { id: "recruitment", label: "戰情", mobile: "戰情", icon: Radio, shortcut: "today" },
  { id: "pending", label: "待處理", mobile: "待處理", icon: ClipboardList, shortcut: "pending" },
  { id: "roster", label: "名單", mobile: "名單", icon: Users, shortcut: "contacts" },
];

const moreNav: NavItem[] = [
  { id: "podium", label: "今日排行榜", mobile: "今日排行", icon: Medal, shortcut: "ranking" },
  { id: "results", label: "歷史排行榜", mobile: "歷史排行", icon: History, shortcut: "history", href: "/leaderboard?scope=history" },
  { id: "contacts", label: "表單資料", mobile: "表單", icon: Sheet, shortcut: "form" },
  { id: "system", label: "同步狀態", mobile: "同步", icon: Settings, shortcut: "sync" },
  { id: "security", label: "系統設定", mobile: "設定", icon: Shield, shortcut: "security" },
  { id: "pinned", label: "我的釘選", mobile: "釘選", icon: Pin, shortcut: "pinned" },
  { id: "results", label: "比賽成績", mobile: "成績", icon: Trophy, shortcut: "results" },
  { id: "leaders", label: "關主", mobile: "關主", icon: Flag, shortcut: "gatekeepers" },
];

function NavButtons({
  items,
  view,
  forms,
  onNavigate,
  onDone,
}: {
  items: NavItem[];
  view: AdminView;
  forms: boolean;
  onNavigate: (view: AdminView, shortcut: string) => void;
  onDone?: () => void;
}) {
  const active = (item: NavItem) => {
    if (item.href) return false;
    if (item.id === "contacts" || item.shortcut === "form") {
      return view === "contacts" && forms === (item.shortcut === "form");
    }
    if (item.id === "roster") return view === "roster" && !forms;
    return view === item.id;
  };
  return items.map((item) => {
    const Icon = item.icon;
    if (item.href) {
      return (
        <a key={item.shortcut} href={item.href} onClick={() => onDone?.()}>
          <Icon size={18} aria-hidden="true" />
          <span>{item.label}</span>
        </a>
      );
    }
    return (
      <button
        key={item.shortcut}
        aria-current={active(item) ? "page" : undefined}
        onClick={() => {
          onNavigate(item.id, item.shortcut);
          onDone?.();
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    );
  });
}

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
  const moreActive = moreNav.some((item) => {
    if (item.href) return false;
    if (item.shortcut === "form") return view === "contacts" && forms;
    if (item.id === "contacts") return false;
    return view === item.id;
  }) || forms;
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
          <NavButtons items={primaryNav} view={view} forms={forms} onNavigate={onNavigate} />
        </nav>
        <p className="admin-nav-label">更多</p>
        <nav aria-label="更多後台導覽">
          <NavButtons items={moreNav} view={view} forms={forms} onNavigate={onNavigate} />
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
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const current = view === item.id && !forms;
          return (
            <button
              key={item.shortcut}
              aria-current={current ? "page" : undefined}
              onClick={() => onNavigate(item.id, item.shortcut)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.mobile}</span>
            </button>
          );
        })}
        <button
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
            <Dialog.Description>排行榜、表單與系統設定</Dialog.Description>
            <Dialog.Close className="admin-close" aria-label="關閉更多">
              <X size={20} />
            </Dialog.Close>
            <nav aria-label="更多後台導覽">
              <NavButtons
                items={moreNav}
                view={view}
                forms={forms}
                onNavigate={onNavigate}
                onDone={() => setMoreOpen(false)}
              />
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

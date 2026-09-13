import { useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  Users,
  Trophy,
  Medal,
  Flag,
  Sheet,
  Settings,
  Pin,
  MoreHorizontal,
  LogOut,
  Radio,
  Shield,
  X,
} from "lucide-react";

export type AdminView =
  "overview" | "recruitment" | "contacts" | "results" | "podium" | "leaders" | "system" | "pinned" | "security";
const navigation = [
  { id: "overview", label: "總覽", mobile: "總覽", icon: BarChart3, shortcut: "today" },
  { id: "recruitment", label: "招生戰情", mobile: "戰情", icon: Radio, shortcut: "recruitment" },
  { id: "contacts", label: "聯絡名單", mobile: "名單", icon: Users, shortcut: "contacts" },
  { id: "results", label: "比賽成績", mobile: "成績", icon: Trophy, shortcut: "results" },
  { id: "podium", label: "前三名", mobile: "排行", icon: Medal, shortcut: "ranking" },
  { id: "leaders", label: "關主", mobile: "關主", icon: Flag, shortcut: "gatekeepers" },
  { id: "contacts", label: "Google 表單", mobile: "表單", icon: Sheet, shortcut: "form" },
  { id: "system", label: "系統", mobile: "系統", icon: Settings, shortcut: "sync" },
  { id: "security", label: "安全與登入", mobile: "安全", icon: Shield, shortcut: "security" },
  { id: "pinned", label: "我的釘選", mobile: "釘選", icon: Pin, shortcut: "pinned" },
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
  const active = (id: AdminView, shortcut: string) =>
    view === id && (id !== "contacts" || forms === (shortcut === "form"));
  const items = (mobile = false) =>
    navigation.map(({ id, label, mobile: short, icon: Icon, shortcut }, index) => (
      <button
        key={shortcut}
        className={mobile && index > 3 ? "mobile-secondary-item" : undefined}
        aria-current={active(id, shortcut) ? "page" : undefined}
        onClick={() => {
          onNavigate(id, shortcut);
          setMoreOpen(false);
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{mobile ? short : label}</span>
      </button>
    ));
  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <BrandLogo />
          <span>
            淡江禪學社<small>活動工作台</small>
          </span>
        </a>
        <p className="admin-nav-label">工作空間</p>
        <nav aria-label="後台導覽">{items()}</nav>
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
        <span>活動工作台</span>
      </div>
      <div className="admin-content">{children}</div>
      <nav className="admin-bottom-nav" aria-label="手機後台導覽">
        {items(true)}
        <button
          aria-label="更多"
          aria-expanded={moreOpen}
          aria-current={
            ["leaders", "system", "security", "pinned"].includes(view) || forms ? "page" : undefined
          }
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
            <Dialog.Title>更多功能</Dialog.Title>
            <Dialog.Description>管理活動與個人工作台</Dialog.Description>
            <Dialog.Close className="admin-close" aria-label="關閉更多">
              <X size={20} />
            </Dialog.Close>
            <nav aria-label="更多後台導覽">{items()}</nav>
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

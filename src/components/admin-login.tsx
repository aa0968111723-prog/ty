import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LockKeyhole, X } from "lucide-react";
import "@/admin.css";

export function AdminLogin({
  onClose,
  onSuccess,
}: {
  onClose?: () => void;
  onSuccess?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "登入失敗，請稍後再試");
      setPassword("");
      if (onSuccess) onSuccess();
      else window.location.assign("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }
  const fields = (
    <>
      <div className="admin-login-mark"><LockKeyhole size={26} /></div>
      {onClose ? <Dialog.Title>管理員登入</Dialog.Title> : <h1>管理員登入</h1>}
      {onClose ? <Dialog.Description>現場工作人員專用</Dialog.Description> : <p>Admin Login · 現場工作人員專用</p>}
      <form onSubmit={login}>
        <label htmlFor="admin-password">管理員密碼</label>
        <input id="admin-password" type="password" autoComplete="current-password"
          required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p role="alert" className="admin-error">{error}</p>}
        <button className="admin-primary" disabled={busy} type="submit">{busy ? "登入中…" : "登入後台"}</button>
      </form>
    </>
  );
  if (!onClose) return <section className="admin-login admin-panel">{fields}<a href="/">返回挑戰賽</a></section>;
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-overlay" />
        <Dialog.Content className="admin-login admin-modal">
          <Dialog.Close className="admin-close" aria-label="關閉登入"><X size={22} /></Dialog.Close>
          {fields}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

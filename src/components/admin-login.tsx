import { useEffect, useMemo, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Fingerprint, LockKeyhole, Shield, X } from "lucide-react";
import { assertDevicePasskey, postAdminJSON, registerDevicePasskey } from "@/lib/club/webauthn-client";
import "@/admin.css";

export type AdminGate = {
  authenticated: boolean;
  passwordEnabled?: boolean;
  googleEnabled?: boolean;
  emergencyFallback?: boolean;
  method?: string;
  setupRequired?: boolean;
  user?: { id: string; email: string; displayName: string };
  device?: { id: string; name: string; pinEnabled: boolean; passkeyEnabled: boolean };
  quickUnlock?: { available: boolean; pin?: boolean; passkey?: boolean; deviceName?: string };
};

function nextPath() {
  if (typeof window === "undefined") return "/admin";
  const path = `${window.location.pathname}${window.location.search}`;
  if (path.startsWith("/follow-up")) return "/follow-up";
  if (path.startsWith("/admin")) {
    const params = new URLSearchParams(window.location.search);
    params.delete("error");
    params.delete("setup");
    params.delete("fallback");
    const search = params.toString();
    return search ? `/admin?${search}` : "/admin";
  }
  return "/admin";
}

function googleHref(intent?: "reset-pin") {
  const params = new URLSearchParams({ next: nextPath() });
  if (intent) params.set("intent", intent);
  return `/api/admin/auth/google?${params.toString()}`;
}

function PinBoxes({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="admin-pin-boxes">
      <label className="admin-sr" htmlFor={id}>4 碼 PIN</label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={4}
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
      />
      <div aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={value[index] ? "is-filled" : undefined}>
            {value[index] ? "•" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.4c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.2 0 10.1 0 12s.5 3.8 1.4 5.5l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

export function AdminLogin({
  onClose,
  onSuccess,
  gate,
}: {
  onClose?: () => void;
  onSuccess?: () => void;
  gate?: AdminGate | null;
}) {
  const search = useMemo(() => (
    typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)
  ), []);
  const urlError = search.get("error");
  const setupPin = search.get("setup") === "pin";
  const [resolved, setGate] = useState<AdminGate | null>(gate ?? null);
  const [view, setView] = useState<"password" | "quick" | "setup" | "pin">("password");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    urlError === "forbidden" ? "此 Google 帳號沒有管理權限" : urlError === "oauth" ? "Google 登入失敗，請再試一次" : "",
  );

  useEffect(() => {
    if (gate) {
      setGate(gate);
      return;
    }
    const controller = new AbortController();
    fetch("/api/admin/session", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => setGate(body))
      .catch(() => {
        if (!controller.signal.aborted) setGate({ authenticated: false, passwordEnabled: true });
      });
    return () => controller.abort();
  }, [gate]);

  useEffect(() => {
    if (!resolved) return;
    if (resolved.authenticated && setupPin) setView("pin");
    else if (resolved.authenticated && resolved.setupRequired) setView("setup");
    else if (!resolved.authenticated && resolved.quickUnlock?.available) setView("quick");
    else setView("password");
  }, [resolved, setupPin]);

  useEffect(() => {
    if (view !== "quick" || !resolved?.quickUnlock?.passkey || busy) return;
    void unlockWithPasskey();
    // Auto-prompt once when returning to a trusted device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, resolved?.quickUnlock?.passkey]);

  async function finished() {
    if (onSuccess) onSuccess();
    else window.location.assign(nextPath() === "/follow-up" ? "/follow-up" : "/admin");
  }

  async function loginPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await postAdminJSON("/api/admin/login", { password });
      setPassword("");
      await finished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function savePin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await postAdminJSON("/api/admin/auth/pin", { pin, confirm: confirm || pin });
      setPin("");
      setConfirm("");
      setView("setup");
      await finished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法設定 PIN");
    } finally {
      setBusy(false);
    }
  }

  async function unlockPin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await postAdminJSON("/api/admin/auth/unlock", { pin });
      setPin("");
      await finished();
    } catch (cause) {
      const payload = (cause as Error & { payload?: { requireGoogle?: boolean; requirePassword?: boolean } }).payload;
      if (payload?.requirePassword || payload?.requireGoogle) {
        setView("password");
        setError(cause instanceof Error ? cause.message : "請改用密碼登入");
        setBusy(false);
        return;
      }
      setError(cause instanceof Error ? cause.message : "解鎖失敗");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithPasskey() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await assertDevicePasskey();
      await finished();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setError("");
      } else {
        setError(cause instanceof Error ? cause.message : "無法使用裝置解鎖");
      }
    } finally {
      setBusy(false);
    }
  }

  async function registerPasskey() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await registerDevicePasskey();
      await finished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法設定裝置解鎖");
    } finally {
      setBusy(false);
    }
  }

  async function skipSetup() {
    if (busy) return;
    setBusy(true);
    try {
      await postAdminJSON("/api/admin/auth/setup/skip", {});
      await finished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  const title = view === "quick" ? "淡江禪學社" : "管理員登入";
  const fields = (
    <>
      <div className="admin-login-mark">{view === "quick" ? <Fingerprint size={26} /> : <LockKeyhole size={26} />}</div>
      {onClose ? <Dialog.Title>{title}</Dialog.Title> : <h1>{title}</h1>}
      {view === "quick" ? (
        onClose ? <Dialog.Description>管理後台</Dialog.Description> : <p>管理後台</p>
      ) : onClose ? (
        <Dialog.Description>現場工作人員專用</Dialog.Description>
      ) : (
        <p>現場工作人員專用</p>
      )}

      {view === "password" && (
        <form onSubmit={loginPassword}>
          <label htmlFor="admin-password">管理員密碼</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p role="alert" className="admin-error">{error}</p>}
          <button className="admin-primary" disabled={busy} type="submit">
            {busy ? "登入中…" : "登入後台"}
          </button>
          {resolved?.googleEnabled && (
            <a className="admin-primary admin-google" href={googleHref()}>
              <GoogleMark />
              使用 Google 登入
            </a>
          )}
        </form>
      )}

      {view === "setup" && (
        <div className="admin-login-actions">
          <h2>設定快速解鎖</h2>
          <p>此裝置已經通過管理員授權。可設定指紋／Face ID、4 碼 PIN，或兩者都設定。</p>
          <button className="admin-primary" disabled={busy} type="button" onClick={() => void registerPasskey()}>
            <Fingerprint size={18} />
            {busy ? "請在裝置上確認…" : "使用指紋 / Face ID"}
          </button>
          <button type="button" disabled={busy} onClick={() => { setView("pin"); setError(""); }}>
            <Shield size={18} />
            設定 4 碼 PIN
          </button>
          <button className="admin-text-btn" type="button" disabled={busy} onClick={() => void skipSetup()}>
            稍後設定
          </button>
          {error && <p role="alert" className="admin-error">{error}</p>}
        </div>
      )}

      {view === "pin" && (
        <form onSubmit={savePin}>
          <label htmlFor="admin-pin-new">輸入 PIN</label>
          <PinBoxes id="admin-pin-new" value={pin} onChange={setPin} autoFocus />
          <label htmlFor="admin-pin-confirm">再次輸入確認</label>
          <PinBoxes id="admin-pin-confirm" value={confirm} onChange={setConfirm} />
          {error && <p role="alert" className="admin-error">{error}</p>}
          <button className="admin-primary" disabled={busy || pin.length !== 4 || confirm.length !== 4} type="submit">
            {busy ? "儲存中…" : "儲存 PIN"}
          </button>
          <button className="admin-text-btn" type="button" onClick={() => { setView("setup"); setError(""); }}>
            返回
          </button>
        </form>
      )}

      {view === "quick" && (
        <div className="admin-login-actions">
          {resolved?.quickUnlock?.passkey && (
            <button className="admin-primary" disabled={busy} type="button" onClick={() => void unlockWithPasskey()}>
              <Fingerprint size={18} />
              {busy ? "請在裝置上確認…" : "使用指紋解鎖"}
            </button>
          )}
          {resolved?.quickUnlock?.pin && (
            <form onSubmit={unlockPin}>
              <label htmlFor="admin-pin-unlock">輸入 4 碼 PIN</label>
              <PinBoxes id="admin-pin-unlock" value={pin} onChange={setPin} autoFocus={!resolved.quickUnlock.passkey} />
              {error && <p role="alert" className="admin-error">{error}</p>}
              <button className="admin-primary" disabled={busy || pin.length !== 4} type="submit">
                {busy ? "解鎖中…" : "解鎖"}
              </button>
            </form>
          )}
          {!resolved?.quickUnlock?.pin && error && <p role="alert" className="admin-error">{error}</p>}
          <button className="admin-text-btn" type="button" onClick={() => { setView("password"); setError(""); }}>
            使用密碼登入
          </button>
          {resolved?.googleEnabled && (
            <a className="admin-text-btn" href={googleHref()}>使用 Google 帳號登入</a>
          )}
          {resolved?.quickUnlock?.pin && resolved.googleEnabled && (
            <a className="admin-text-btn" href={googleHref("reset-pin")}>忘記 PIN？</a>
          )}
        </div>
      )}
    </>
  );

  if (!onClose) {
    return (
      <section className="admin-login admin-panel">
        {fields}
        <a href="/">返回挑戰賽</a>
      </section>
    );
  }
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

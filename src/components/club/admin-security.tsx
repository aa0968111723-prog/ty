import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Pencil, Shield, Smartphone, Trash2 } from "lucide-react";
import { postAdminJSON, registerDevicePasskey } from "@/lib/club/webauthn-client";
import { publicAdminError } from "@/lib/club/public-error.mjs";

type Device = {
  id: string;
  name: string;
  pinEnabled: boolean;
  passkeyEnabled: boolean;
  lastMethod: string | null;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
  current: boolean;
};

function lastUsedLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const taipei = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = taipei.format(new Date());
  const yesterday = taipei.format(new Date(Date.now() - 86400000));
  const value = taipei.format(date);
  if (value === today) return "今天";
  if (value === yesterday) return "昨天";
  return value.replaceAll("-", ".");
}

function methodLabel(device: Device) {
  const parts = [];
  if (device.passkeyEnabled) parts.push("指紋");
  if (device.pinEnabled) parts.push("PIN");
  if (!parts.length) parts.push(device.lastMethod === "google" ? "Google 登入" : "密碼登入");
  return parts.join(" + ");
}

export function AdminSecurity() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/auth/devices");
    const body = await response.json();
    if (!response.ok) throw new Error(publicAdminError(body.error, "無法讀取裝置"));
    setDevices(body.devices || []);
  }, []);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? publicAdminError(cause.message, "無法讀取裝置") : "無法讀取裝置"));
  }, [load]);

  async function send(path: string, body: unknown) {
    return postAdminJSON(path, body);
  }

  const active = devices.filter((device) => !device.revokedAt);

  return (
    <section className="admin-panel admin-security">
      <h2>安全與登入</h2>
      <p className="admin-caption">現場以管理員密碼登入。已授權裝置可用指紋或 PIN 快速解鎖。若已設定 Google 白名單，也可使用 Google 帳號。</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <h3>我的裝置</h3>
      {!active.length ? (
        <p className="admin-empty">目前沒有已授權裝置。</p>
      ) : (
        <ul className="admin-device-list">
          {active.map((device) => (
            <li key={device.id}>
              <div>
                <strong>
                  <Smartphone size={16} aria-hidden="true" />
                  {renaming === device.id ? (
                    <input
                      aria-label="裝置名稱"
                      value={name}
                      maxLength={80}
                      onChange={(event) => setName(event.target.value)}
                    />
                  ) : device.name}
                </strong>
                <span className="admin-badge">{methodLabel(device)}</span>
                {device.current && <span className="admin-badge">目前裝置</span>}
                <small>最近使用：{lastUsedLabel(device.lastUsedAt)}</small>
              </div>
              <div className="admin-device-actions">
                {renaming === device.id ? (
                  <button
                    disabled={busy === device.id}
                    onClick={() => {
                      setBusy(device.id);
                      void send("/api/admin/auth/devices/rename", { id: device.id, deviceName: name })
                        .then(() => load())
                        .then(() => setRenaming(null))
                        .catch((cause) => setError(cause instanceof Error ? publicAdminError(cause.message, "重新命名失敗") : "重新命名失敗"))
                        .finally(() => setBusy(""));
                    }}
                  >
                    儲存
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setRenaming(device.id);
                      setName(device.name);
                    }}
                  >
                    <Pencil size={16} />
                    重新命名
                  </button>
                )}
                {device.current && (
                  <>
                    <button onClick={() => setShowPin((value) => !value)}>
                      <Shield size={16} />
                      {device.pinEnabled ? "重新設定 PIN" : "設定 PIN"}
                    </button>
                    {device.pinEnabled && (
                      <button
                        disabled={busy === device.id}
                        onClick={() => {
                          setBusy(device.id);
                          void send("/api/admin/auth/pin/disable", { deviceId: device.id })
                            .then(() => load())
                            .catch((cause) => setError(cause instanceof Error ? publicAdminError(cause.message, "無法關閉 PIN") : "無法關閉 PIN"))
                            .finally(() => setBusy(""));
                        }}
                      >
                        關閉 PIN
                      </button>
                    )}
                    <button
                      disabled={busy === "passkey"}
                      onClick={() => {
                        setBusy("passkey");
                        void registerDevicePasskey()
                          .then(() => load())
                          .catch((cause) => setError(cause instanceof Error ? publicAdminError(cause.message, "無法新增指紋解鎖") : "無法新增指紋解鎖"))
                          .finally(() => setBusy(""));
                      }}
                    >
                      <Fingerprint size={16} />
                      新增指紋／Face ID
                    </button>
                  </>
                )}
                <button
                  disabled={busy === device.id}
                  onClick={() => {
                    if (!window.confirm("移除此裝置後，必須重新用密碼登入。")) return;
                    setBusy(device.id);
                    void send("/api/admin/auth/devices/revoke", { id: device.id })
                      .then((payload) => {
                        if (payload.currentRevoked) window.location.assign("/admin");
                        else return load();
                      })
                      .catch((cause) => setError(cause instanceof Error ? publicAdminError(cause.message, "無法移除裝置") : "無法移除裝置"))
                      .finally(() => setBusy(""));
                  }}
                >
                  <Trash2 size={16} />
                  移除裝置
                </button>
              </div>
              {device.current && showPin && (
                <form
                  className="admin-pin-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setBusy("pin");
                    void send("/api/admin/auth/pin", { pin, confirm })
                      .then(() => {
                        setPin("");
                        setConfirm("");
                        setShowPin(false);
                        return load();
                      })
                      .catch((cause) => setError(cause instanceof Error ? publicAdminError(cause.message, "無法設定 PIN") : "無法設定 PIN"))
                      .finally(() => setBusy(""));
                  }}
                >
                  <label>
                    新 PIN
                    <input inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} />
                  </label>
                  <label>
                    再次確認
                    <input inputMode="numeric" autoComplete="off" maxLength={4} value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} />
                  </label>
                  <button className="admin-primary" disabled={busy === "pin" || pin.length !== 4 || confirm.length !== 4}>
                    儲存 PIN
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

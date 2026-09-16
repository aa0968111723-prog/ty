import { publicAdminError } from "@/lib/club/public-error.mjs";

function bufToB64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64urlToBuf(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export function decodePublicKeyOptions(options: Record<string, unknown>) {
  const decoded = structuredClone(options) as Record<string, unknown>;
  decoded.challenge = b64urlToBuf(String(options.challenge || ""));
  const user = options.user as { id?: string } | undefined;
  if (user?.id && decoded.user && typeof decoded.user === "object") {
    (decoded.user as { id: ArrayBuffer }).id = b64urlToBuf(user.id);
  }
  const mapCreds = (rows: unknown) => Array.isArray(rows)
    ? rows.map((row: { id: string; type?: string; transports?: string[] }) => ({
        ...row,
        id: b64urlToBuf(row.id),
        type: row.type || "public-key",
      }))
    : undefined;
  decoded.excludeCredentials = mapCreds(options.excludeCredentials);
  decoded.allowCredentials = mapCreds(options.allowCredentials);
  return decoded as unknown as PublicKeyCredentialCreationOptions & PublicKeyCredentialRequestOptions;
}

export function credentialToJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufToB64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bufToB64url(response.clientDataJSON),
      attestationObject: response.attestationObject ? bufToB64url(response.attestationObject) : undefined,
      authenticatorData: response.authenticatorData ? bufToB64url(response.authenticatorData) : undefined,
      signature: response.signature ? bufToB64url(response.signature) : undefined,
      userHandle: response.userHandle ? bufToB64url(response.userHandle) : undefined,
      transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
    },
  };
}

export async function postAdminJSON(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(publicAdminError(payload.error, "操作失敗，請稍後再試"));
    (error as Error & { payload?: unknown }).payload = payload;
    throw error;
  }
  return payload;
}

export async function registerDevicePasskey() {
  const optionsRes = await postAdminJSON("/api/admin/auth/webauthn/register/options", {});
  const publicKey = decodePublicKeyOptions(optionsRes.options);
  const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
  if (!credential) throw new Error("已取消裝置解鎖");
  return postAdminJSON("/api/admin/auth/webauthn/register", {
    credential: credentialToJSON(credential),
    expectedChallenge: optionsRes.options.challenge,
  });
}

export async function assertDevicePasskey() {
  const optionsRes = await postAdminJSON("/api/admin/auth/webauthn/login/options", {});
  const publicKey = decodePublicKeyOptions(optionsRes.options);
  const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null;
  if (!credential) throw new Error("已取消裝置解鎖");
  return postAdminJSON("/api/admin/auth/webauthn/login", {
    credential: credentialToJSON(credential),
    expectedChallenge: optionsRes.options.challenge,
  });
}

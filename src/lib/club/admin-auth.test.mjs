// @ts-nocheck -- Node test file; runtime assertions cover the identity flow.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  handleAdminLogin, handleAdminSession, handleAdminLogout, handleAdminDashboard,
} from "./admin.mjs";
import {
  handleAdminAuth,
  handleGoogleStart,
  handleGoogleCallback,
  handlePinSetup,
  handlePinUnlock,
  handlePinDisable,
  handleSetupSkip,
  handleWebAuthnRegisterOptions,
  handleWebAuthnRegister,
  handleWebAuthnLoginOptions,
  handleWebAuthnLogin,
  handleListDevices,
  handleRevokeDevice,
  resetAdminAuthStore,
  setGoogleIdentityVerifier,
  setWebAuthnAdapter,
  hashPin,
  verifyPin,
  getAdminAuthStore,
  parseAllowedEmails,
  DEVICE_COOKIE,
  relyingPartyId,
  webauthnOrigin,
} from "./admin-auth.mjs";

const origin = "https://club.example.test";
const request = (path, { method, body, cookie, headers = {}, ua } = {}) =>
  new Request(`https://club.internal:8080${path}`, {
    method: method || (body === undefined && !path.includes("unlock") && !path.endsWith("/pin") ? "GET" : "POST"),
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(ua ? { "user-agent": ua } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

function cookiesFrom(response) {
  const list = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return list.map((item) => String(item).split(";")[0]).filter(Boolean).join("; ");
}

function env(t) {
  const names = [
    "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "PUBLIC_ORIGIN",
    "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "ADMIN_ALLOWED_EMAILS",
  ];
  const before = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (before[i] === undefined) delete process.env[name];
    else process.env[name] = before[i];
  }));
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.PUBLIC_ORIGIN = origin;
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = randomBytes(16).toString("hex");
  process.env.ADMIN_ALLOWED_EMAILS = "admin@example.com, second@example.com";
}

async function googleLogin(t, { email = "admin@example.com", code = "ok-code", ua = "Mozilla/5.0 Chrome Windows", intent, reset = true, cookie = "" } = {}) {
  env(t);
  if (reset) resetAdminAuthStore();
  setGoogleIdentityVerifier(async ({ code: received }) => {
    if (received !== code) throw new Error("bad code");
    return { sub: `sub-${email}`, email, name: "管理員", email_verified: true };
  });
  const next = encodeURIComponent("/admin?view=pinned");
  const startUrl = intent
    ? `/api/admin/auth/google?next=${next}&intent=${intent}`
    : `/api/admin/auth/google?next=${next}`;
  const start = await handleGoogleStart(request(startUrl, { method: "GET" }));
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get("location"));
  assert.equal(location.hostname, "accounts.google.com");
  assert.ok(!location.search.includes(email));
  const deviceCookie = String(cookie).split("; ").find((part) => part.startsWith(`${DEVICE_COOKIE}=`)) || "";
  const oauthCookie = [cookiesFrom(start), deviceCookie].filter(Boolean).join("; ");
  const callback = await handleGoogleCallback(request(
    `/api/admin/auth/callback?code=${code}&state=${encodeURIComponent(location.searchParams.get("state"))}`,
    { method: "GET", cookie: oauthCookie, ua },
  ));
  assert.equal(callback.status, 302);
  return { location: callback.headers.get("location"), cookie: cookiesFrom(callback), start };
}

test("fingerprint origin follows the current page instead of PUBLIC_ORIGIN", async (t) => {
  const previous = process.env.PUBLIC_ORIGIN;
  t.after(() => {
    if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previous;
  });
  process.env.PUBLIC_ORIGIN = "https://live.example.app";
  const request = new Request("https://club.internal:8080/api/admin/auth/webauthn/register", {
    headers: { origin: "http://localhost:8080" },
  });
  assert.equal(webauthnOrigin(request), "http://localhost:8080");
  assert.equal(relyingPartyId(request), "localhost");
});

test("booth password works before env is set and switches when ADMIN_PASSWORD is configured", async (t) => {
  const names = [
    "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "PUBLIC_ORIGIN",
    "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "ADMIN_ALLOWED_EMAILS",
  ];
  const before = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (before[i] === undefined) delete process.env[name];
    else process.env[name] = before[i];
  }));
  for (const name of names) delete process.env[name];
  resetAdminAuthStore();
  const local = { headers: { origin: "https://club.internal:8080" } };
  const denied = await handleAdminLogin(request("/api/admin/login", { body: { password: "wrong" }, ...local }));
  assert.equal(denied.status, 401);
  const booth = await handleAdminLogin(request("/api/admin/login", { body: { password: "tkuzen" }, ...local }));
  assert.equal(booth.status, 200);
  const boothSession = await (await handleAdminSession(request("/api/admin/session", { cookie: cookiesFrom(booth) }))).json();
  assert.equal(boothSession.authenticated, true);
  assert.equal(boothSession.method, "password");
  assert.equal(boothSession.setupRequired, true);
  assert.equal(boothSession.passwordEnabled, true);
  assert.equal(JSON.stringify(boothSession).includes("tkuzen"), false);
  assert.equal(JSON.stringify(boothSession).includes("ADMIN_PASSWORD"), false);

  const configuredPassword = randomBytes(16).toString("hex");
  process.env.ADMIN_PASSWORD = configuredPassword;
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.PUBLIC_ORIGIN = origin;
  assert.equal((await handleAdminLogin(request("/api/admin/login", { body: { password: "tkuzen" } }))).status, 401);
  const configured = await handleAdminLogin(request("/api/admin/login", { body: { password: configuredPassword } }));
  assert.equal(configured.status, 200);
  assert.equal(cookiesFrom(configured).includes(configuredPassword), false);
  const configuredSession = await (await handleAdminSession(request("/api/admin/session", { cookie: cookiesFrom(configured) }))).json();
  assert.equal(configuredSession.authenticated, true);
  assert.equal(configuredSession.method, "password");
});

test("password login can set PIN and fingerprint without Google", async (t) => {
  const names = [
    "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "PUBLIC_ORIGIN",
    "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "ADMIN_ALLOWED_EMAILS",
  ];
  const before = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (before[i] === undefined) delete process.env[name];
    else process.env[name] = before[i];
  }));
  for (const name of names) delete process.env[name];
  process.env.PUBLIC_ORIGIN = origin;
  resetAdminAuthStore();
  setWebAuthnAdapter({
    async registrationOptions() {
      return { challenge: "booth-reg", authenticatorSelection: { userVerification: "required" } };
    },
    async verifyRegistration() {
      return { credentialId: "booth-cred", publicKey: "pk", counter: 0, transports: ["internal"] };
    },
    async authenticationOptions() {
      return { challenge: "booth-auth", userVerification: "required" };
    },
    async verifyAuthentication() {
      return { newCounter: 1 };
    },
  });
  const login = await handleAdminLogin(request("/api/admin/login", { body: { password: "tkuzen" } }));
  assert.equal(login.status, 200);
  const cookie = cookiesFrom(login);
  assert.equal((await handlePinSetup(request("/api/admin/auth/pin", {
    body: { pin: "2468", confirm: "2468" }, cookie,
  }))).status, 200);
  assert.equal((await handleWebAuthnRegisterOptions(request("/api/admin/auth/webauthn/register/options", {
    body: {}, cookie,
  }))).status, 200);
  assert.equal((await handleWebAuthnRegister(request("/api/admin/auth/webauthn/register", {
    body: { credential: { id: "booth-cred" }, expectedChallenge: "booth-reg" }, cookie,
  }))).status, 200);
  await handleAdminLogout(request("/api/admin/logout", { body: {}, cookie }));
  const deviceCookie = cookie.split("; ").find((part) => part.startsWith("__Host-club_device="));
  const unlocked = await handlePinUnlock(request("/api/admin/auth/unlock", {
    body: { pin: "2468" }, cookie: deviceCookie, method: "POST",
  }));
  assert.equal(unlocked.status, 200);
  const pinSession = await (await handleAdminSession(request("/api/admin/session", { cookie: cookiesFrom(unlocked) }))).json();
  assert.equal(pinSession.authenticated, true);
  assert.equal(pinSession.method, "pin");
  const passkey = await handleWebAuthnLogin(request("/api/admin/auth/webauthn/login", {
    body: { credential: { id: "booth-cred" }, expectedChallenge: "booth-auth" }, cookie: deviceCookie, method: "POST",
  }));
  assert.equal(passkey.status, 200);
  const passkeySession = await (await handleAdminSession(request("/api/admin/session", { cookie: cookiesFrom(passkey) }))).json();
  assert.equal(passkeySession.authenticated, true);
  assert.equal(passkeySession.method, "passkey");
});

test("allowed email list parses without leaking formatting noise", () => {
  assert.deepEqual([...parseAllowedEmails("admin@example.com, second@example.com \n")], ["admin@example.com", "second@example.com"]);
});

test("PIN hashes are salted and never equal the plaintext", () => {
  const hash = hashPin("1234");
  assert.equal(verifyPin("1234", hash), true);
  assert.equal(verifyPin("1235", hash), false);
  assert.notEqual(hash, "1234");
  assert.equal(hash.includes("1234"), false);
  assert.notEqual(hashPin("1234"), hash);
});

test("Google login admits only allowlisted emails and never echoes the list", async (t) => {
  const allowed = await googleLogin(t);
  assert.match(allowed.location, /\/admin/);
  assert.match(allowed.cookie, /__Host-club_admin=/);
  assert.match(allowed.cookie, /__Host-club_device=/);
  const session = await (await handleAdminSession(request("/api/admin/session", { cookie: allowed.cookie }))).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.method, "google");
  assert.equal(session.user.email, "admin@example.com");
  assert.equal(session.setupRequired, true);
  const denied = await googleLogin(t, { email: "stranger@example.com", code: "deny-code" });
  assert.equal(denied.location, "/admin?error=forbidden");
  assert.equal(JSON.stringify(denied).includes("ADMIN_ALLOWED_EMAILS"), false);
  assert.equal(JSON.stringify(denied).includes("stranger@example.com"), false);
  const source = readFileSync(new URL("./admin-auth.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("console.log(body.pin)"), false);
});

test("first-use device can set a hashed PIN; a new device cannot unlock with PIN alone", async (t) => {
  const first = await googleLogin(t, { ua: "Mozilla/5.0 OPPO Android Chrome" });
  const pinRes = await handlePinSetup(request("/api/admin/auth/pin", {
    body: { pin: "2468", confirm: "2468" }, cookie: first.cookie, ua: "OPPO Android",
  }));
  assert.equal(pinRes.status, 200);
  const store = getAdminAuthStore();
  const devices = await store.listDevices((await store.listAudit())[0].userId);
  assert.equal(devices[0].pinEnabled, true);
  assert.ok(devices[0].pinHash);
  assert.equal(devices[0].pinHash.includes("2468"), false);
  await handleAdminLogout(request("/api/admin/logout", { body: {}, cookie: first.cookie }));
  const deviceCookie = first.cookie.split("; ").find((part) => part.startsWith("__Host-club_device="));
  const unlocked = await handlePinUnlock(request("/api/admin/auth/unlock", {
    body: { pin: "2468" }, cookie: deviceCookie, method: "POST",
  }));
  assert.equal(unlocked.status, 200);
  const freshSession = await (await handleAdminSession(request("/api/admin/session", { cookie: cookiesFrom(unlocked) }))).json();
  assert.equal(freshSession.authenticated, true);
  assert.equal(freshSession.method, "pin");
  const stranger = await handlePinUnlock(request("/api/admin/auth/unlock", {
    body: { pin: "2468" }, method: "POST",
  }));
  assert.equal(stranger.status, 401);
  const audit = await store.listAudit();
  assert.ok(audit.every((row) => !JSON.stringify(row).includes("2468")));
  assert.ok(audit.some((row) => row.method === "pin" && row.success === true));
  assert.ok(audit.some((row) => row.method === "google" && row.success === true));
});

test("PIN lockout is server-side: 5, 10, then Google re-auth", async (t) => {
  const first = await googleLogin(t);
  assert.equal((await handlePinSetup(request("/api/admin/auth/pin", {
    body: { pin: "1111", confirm: "1111" }, cookie: first.cookie,
  }))).status, 200);
  const deviceCookie = first.cookie.split("; ").find((part) => part.startsWith("__Host-club_device="));
  for (let i = 0; i < 5; i += 1) {
    const failed = await handlePinUnlock(request("/api/admin/auth/unlock", {
      body: { pin: "0000" }, cookie: deviceCookie, method: "POST",
    }));
    assert.equal(failed.status, 401);
  }
  const locked = await handlePinUnlock(request("/api/admin/auth/unlock", {
    body: { pin: "1111" }, cookie: deviceCookie, method: "POST",
  }));
  assert.equal(locked.status, 429);
  const store = getAdminAuthStore();
  const device = (await store.listDevices((await store.listAudit()).find((row) => row.userId).userId))[0];
  await store.updateDevice(device.id, { lockedUntil: new Date(Date.now() - 1000).toISOString() });
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await handlePinUnlock(request("/api/admin/auth/unlock", {
      body: { pin: "0000" }, cookie: deviceCookie, method: "POST",
    }))).status, 401);
  }
  await store.updateDevice(device.id, { lockedUntil: new Date(Date.now() - 1000).toISOString() });
  for (let i = 0; i < 5; i += 1) {
    const response = await handlePinUnlock(request("/api/admin/auth/unlock", {
      body: { pin: "0000" }, cookie: deviceCookie, method: "POST",
    }));
    if (i < 4) assert.equal(response.status, 401);
    else {
      assert.equal(response.status, 403);
      assert.equal((await response.json()).requireGoogle, true);
    }
  }
});

test("WebAuthn register/login is device-bound and userVerification required", async (t) => {
  const first = await googleLogin(t);
  setWebAuthnAdapter({
    async registrationOptions() {
      return { challenge: "reg-challenge", authenticatorSelection: { userVerification: "required" } };
    },
    async verifyRegistration() {
      return { credentialId: "cred-1", publicKey: "pk", counter: 0, transports: ["internal"] };
    },
    async authenticationOptions() {
      return { challenge: "auth-challenge", userVerification: "required" };
    },
    async verifyAuthentication() {
      return { newCounter: 1 };
    },
  });
  const options = await handleWebAuthnRegisterOptions(request("/api/admin/auth/webauthn/register/options", {
    body: {}, cookie: first.cookie,
  }));
  assert.equal(options.status, 200);
  const created = await handleWebAuthnRegister(request("/api/admin/auth/webauthn/register", {
    body: { credential: { id: "cred-1" }, expectedChallenge: "reg-challenge" }, cookie: first.cookie,
  }));
  assert.equal(created.status, 200);
  await handleAdminLogout(request("/api/admin/logout", { body: {}, cookie: first.cookie }));
  const deviceCookie = first.cookie.split("; ").find((part) => part.startsWith("__Host-club_device="));
  const loginOptions = await handleWebAuthnLoginOptions(request("/api/admin/auth/webauthn/login/options", {
    body: {}, cookie: deviceCookie, method: "POST",
  }));
  assert.equal(loginOptions.status, 200);
  const login = await handleWebAuthnLogin(request("/api/admin/auth/webauthn/login", {
    body: { credential: { id: "cred-1" }, expectedChallenge: "auth-challenge" }, cookie: deviceCookie, method: "POST",
  }));
  assert.equal(login.status, 200);
  const session = await (await handleAdminSession(request("/api/admin/session", { cookie: cookiesFrom(login) }))).json();
  assert.equal(session.method, "passkey");
  const skipped = await handleWebAuthnLogin(request("/api/admin/auth/webauthn/login", {
    body: { credential: { id: "cred-1" } }, method: "POST",
  }));
  assert.equal(skipped.status, 401);
});

test("revoking a device invalidates PIN, passkey and the admin session", async (t) => {
  const first = await googleLogin(t);
  await handlePinSetup(request("/api/admin/auth/pin", {
    body: { pin: "9999", confirm: "9999" }, cookie: first.cookie,
  }));
  setWebAuthnAdapter({
    async registrationOptions() { return { challenge: "c" }; },
    async verifyRegistration() { return { credentialId: "cred-2", publicKey: "pk", counter: 0, transports: [] }; },
    async authenticationOptions() { return { challenge: "a" }; },
    async verifyAuthentication() { return { newCounter: 2 }; },
  });
  await handleWebAuthnRegisterOptions(request("/api/admin/auth/webauthn/register/options", { body: {}, cookie: first.cookie }));
  await handleWebAuthnRegister(request("/api/admin/auth/webauthn/register", {
    body: { credential: { id: "cred-2" } }, cookie: first.cookie,
  }));
  const listed = await (await handleListDevices(request("/api/admin/auth/devices", { cookie: first.cookie, method: "GET" }))).json();
  assert.equal(listed.devices[0].pinEnabled, true);
  assert.equal(listed.devices[0].passkeyEnabled, true);
  const revoked = await handleRevokeDevice(request("/api/admin/auth/devices/revoke", {
    body: { id: listed.currentDeviceId }, cookie: first.cookie,
  }));
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).currentRevoked, true);
  const after = await (await handleAdminSession(request("/api/admin/session", { cookie: first.cookie }))).json();
  assert.equal(after.authenticated, false);
  const pin = await handlePinUnlock(request("/api/admin/auth/unlock", {
    body: { pin: "9999" }, cookie: first.cookie, method: "POST",
  }));
  assert.equal(pin.status, 401);
  assert.equal((await handleAdminDashboard(request("/api/admin/dashboard", { cookie: first.cookie }))).status, 401);
});

test("forgot PIN / Google re-auth clears PIN and requires a new setup", async (t) => {
  const first = await googleLogin(t);
  await handlePinSetup(request("/api/admin/auth/pin", {
    body: { pin: "4321", confirm: "4321" }, cookie: first.cookie,
  }));
  const reset = await googleLogin(t, {
    intent: "reset-pin",
    reset: false,
    code: "reset-code",
    cookie: first.cookie,
    ua: "Mozilla/5.0 Chrome Windows",
  });
  const session = await (await handleAdminSession(request("/api/admin/session", { cookie: reset.cookie }))).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.device.pinEnabled, false);
  const deviceCookie = first.cookie.split("; ").find((part) => part.startsWith("__Host-club_device="));
  assert.equal((await handlePinUnlock(request("/api/admin/auth/unlock", {
    body: { pin: "4321" }, cookie: deviceCookie, method: "POST",
  }))).status, 401);
});

test("auth dispatcher and skip-setup keep a unified admin session", async (t) => {
  const first = await googleLogin(t);
  assert.equal((await handleSetupSkip(request("/api/admin/auth/setup/skip", { body: {}, cookie: first.cookie }))).status, 200);
  const session = await (await handleAdminSession(request("/api/admin/session", { cookie: first.cookie }))).json();
  assert.equal(session.setupRequired, false);
  assert.equal((await handleAdminAuth(request("/api/admin/auth/missing", { method: "GET" }))).status, 404);
  const missing = await (await handleAdminAuth(request("/api/admin/auth/missing", { method: "GET" }))).json();
  assert.equal(missing.error, "找不到這個功能");
  assert.equal((await handlePinDisable(request("/api/admin/auth/pin/disable", { body: {}, cookie: first.cookie }))).status, 200);
});

test("emergency password login still works but is not required for Google", async (t) => {
  env(t);
  resetAdminAuthStore();
  process.env.ADMIN_PASSWORD = randomBytes(16).toString("hex");
  const google = await googleLogin(t);
  assert.equal((await handleAdminDashboard(request("/api/admin/dashboard?date=2026-09-12", { cookie: google.cookie }))).status, 200);
  const passwordLogin = await handleAdminLogin(request("/api/admin/login", { body: { password: process.env.ADMIN_PASSWORD } }));
  assert.equal(passwordLogin.status, 200);
  delete process.env.ADMIN_PASSWORD;
  const googleOnly = await googleLogin(t, { code: "second" });
  assert.equal((await handleAdminSession(request("/api/admin/session", { cookie: googleOnly.cookie }))).status, 200);
});

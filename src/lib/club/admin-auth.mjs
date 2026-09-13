// @ts-nocheck -- Admin identity handlers are covered by src/lib/club/admin-auth.test.mjs.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { SECURITY_HEADERS } from "./api.mjs";

export const SESSION_COOKIE = "__Host-club_admin";
export const DEVICE_COOKIE = "__Host-club_device";
export const OAUTH_COOKIE = "__Host-club_oauth";
export const SESSION_SECONDS = 8 * 60 * 60;
const DEVICE_SECONDS = 90 * 24 * 60 * 60;
const OAUTH_SECONDS = 600;
const PIN_N = 16384;
const PIN_R = 8;
const PIN_P = 1;
const PIN_KEYLEN = 32;

/** @type {ReturnType<typeof createMemoryStore>} */
let store;
let skipPostgres = false;
/** @type {null | ((input: { code: string, redirectUri: string }) => Promise<{ sub: string, email: string, name?: string, email_verified?: boolean }>)} */
let googleVerifier = null;
/** @type {null | WebAuthnAdapter} */
let webauthnAdapter = null;

/**
 * @typedef {{
 *   registrationOptions: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
 *   verifyRegistration: (input: Record<string, unknown>) => Promise<{ credentialId: string, publicKey: string, counter: number, transports: string[] }>,
 *   authenticationOptions: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
 *   verifyAuthentication: (input: Record<string, unknown>) => Promise<{ newCounter: number }>,
 * }} WebAuthnAdapter
 */

export function resetAdminAuthStore() {
  store = createMemoryStore();
  skipPostgres = true;
}

export function setGoogleIdentityVerifier(fn) {
  googleVerifier = fn;
}

export function setWebAuthnAdapter(adapter) {
  webauthnAdapter = adapter;
}

export function getAdminAuthStore() {
  return store;
}

export function createMemoryStore() {
  /** @type {Map<string, any>} */
  const users = new Map();
  /** @type {Map<string, any>} */
  const devices = new Map();
  /** @type {Map<string, any>} */
  const passkeys = new Map();
  /** @type {Map<string, any>} */
  const sessions = new Map();
  /** @type {Map<string, any>} */
  const challenges = new Map();
  /** @type {any[]} */
  const audit = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return {
    async upsertUser({ googleSubject, email, displayName }) {
      const existing = [...users.values()].find((row) => row.googleSubject === googleSubject);
      const now = new Date().toISOString();
      if (existing) {
        existing.email = email;
        existing.displayName = displayName || existing.displayName;
        existing.lastLoginAt = now;
        return clone(existing);
      }
      const row = {
        id: randomUUID(),
        googleSubject,
        email,
        displayName: displayName || "",
        createdAt: now,
        lastLoginAt: now,
      };
      users.set(row.id, row);
      return clone(row);
    },
    async getUser(id) {
      const row = users.get(id);
      return row ? clone(row) : null;
    },
    async getUserByEmail(email) {
      const row = [...users.values()].find((item) => item.email === email);
      return row ? clone(row) : null;
    },
    async createDevice({ userId, deviceName }) {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        userId,
        deviceName: deviceName || "此裝置",
        pinHash: null,
        pinEnabled: false,
        passkeyEnabled: false,
        failedAttempts: 0,
        lockedUntil: null,
        pinReauthRequired: false,
        setupSkipped: false,
        lastMethod: "google",
        createdAt: now,
        lastUsedAt: now,
        revokedAt: null,
      };
      devices.set(row.id, row);
      return clone(row);
    },
    async getDevice(id) {
      const row = devices.get(id);
      return row ? clone(row) : null;
    },
    async listDevices(userId) {
      return [...devices.values()].filter((row) => row.userId === userId).map(clone);
    },
    async updateDevice(id, patch) {
      const row = devices.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return clone(row);
    },
    async revokeDevice(id) {
      const row = devices.get(id);
      if (!row) return null;
      row.revokedAt = new Date().toISOString();
      row.pinHash = null;
      row.pinEnabled = false;
      row.passkeyEnabled = false;
      for (const [key, passkey] of passkeys) {
        if (passkey.deviceId === id) passkeys.delete(key);
      }
      for (const session of sessions.values()) {
        if (session.deviceId === id) session.revokedAt = row.revokedAt;
      }
      return clone(row);
    },
    async createPasskey(row) {
      const now = new Date().toISOString();
      const saved = {
        id: randomUUID(),
        lastUsedAt: null,
        createdAt: now,
        transports: [],
        counter: 0,
        ...row,
      };
      passkeys.set(saved.id, saved);
      return clone(saved);
    },
    async getPasskeyByCredentialId(credentialId) {
      const row = [...passkeys.values()].find((item) => item.credentialId === credentialId);
      return row ? clone(row) : null;
    },
    async listPasskeys(userId, deviceId) {
      return [...passkeys.values()]
        .filter((row) => row.userId === userId && (!deviceId || row.deviceId === deviceId))
        .map(clone);
    },
    async updatePasskey(id, patch) {
      const row = passkeys.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return clone(row);
    },
    async createSession({ userId, deviceId, method, tokenHash, expiresAt }) {
      const row = {
        id: randomUUID(),
        userId,
        deviceId: deviceId || null,
        method,
        tokenHash,
        expiresAt,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      };
      sessions.set(row.id, row);
      return clone(row);
    },
    async getSessionByTokenHash(tokenHash) {
      const row = [...sessions.values()].find((item) => item.tokenHash === tokenHash);
      return row ? clone(row) : null;
    },
    async revokeSession(id) {
      const row = sessions.get(id);
      if (!row) return null;
      row.revokedAt = new Date().toISOString();
      return clone(row);
    },
    async revokeSessionsForDevice(deviceId) {
      const now = new Date().toISOString();
      for (const session of sessions.values()) {
        if (session.deviceId === deviceId) session.revokedAt = now;
      }
    },
    async createChallenge({ kind, userId, deviceId, value, expiresAt }) {
      const row = {
        id: randomUUID(),
        kind,
        userId: userId || null,
        deviceId: deviceId || null,
        value,
        expiresAt,
        createdAt: new Date().toISOString(),
      };
      challenges.set(row.id, row);
      return clone(row);
    },
    async consumeChallenge(id) {
      const row = challenges.get(id);
      if (!row) return null;
      challenges.delete(id);
      if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
      return clone(row);
    },
    async consumeLatestChallenge(kind, userId, deviceId) {
      const now = Date.now();
      const matches = [...challenges.values()]
        .filter((row) =>
          row.kind === kind
          && row.userId === userId
          && (!deviceId || row.deviceId === deviceId)
          && new Date(row.expiresAt).getTime() > now)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const row = matches[0];
      if (!row) return null;
      challenges.delete(row.id);
      return clone(row);
    },
    async addAudit({ userId, deviceId, method, success }) {
      const row = {
        id: randomUUID(),
        userId: userId || null,
        deviceId: deviceId || null,
        method,
        success: Boolean(success),
        createdAt: new Date().toISOString(),
      };
      audit.push(row);
      return clone(row);
    },
    async listAudit(userId) {
      return audit.filter((row) => !userId || row.userId === userId).map(clone);
    },
  };
}

store = createMemoryStore();

export function createSqlStore(query) {
  const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const userFrom = (row) => row && ({
    id: row.id,
    googleSubject: row.google_subject,
    email: row.email,
    displayName: row.display_name,
    createdAt: toIso(row.created_at),
    lastLoginAt: toIso(row.last_login_at),
  });
  const deviceFrom = (row) => row && ({
    id: row.id,
    userId: row.user_id,
    deviceName: row.device_name,
    pinHash: row.pin_hash,
    pinEnabled: Boolean(row.pin_enabled),
    passkeyEnabled: Boolean(row.passkey_enabled),
    failedAttempts: Number(row.failed_attempts || 0),
    lockedUntil: toIso(row.locked_until),
    pinReauthRequired: Boolean(row.pin_reauth_required),
    setupSkipped: Boolean(row.setup_skipped),
    lastMethod: row.last_method,
    createdAt: toIso(row.created_at),
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
  });
  const passkeyFrom = (row) => row && ({
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter || 0),
    transports: row.transports ? JSON.parse(row.transports) : [],
    createdAt: toIso(row.created_at),
    lastUsedAt: toIso(row.last_used_at),
  });
  const sessionFrom = (row) => row && ({
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    method: row.method,
    tokenHash: row.token_hash,
    expiresAt: toIso(row.expires_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: toIso(row.created_at),
  });
  return {
    async upsertUser({ googleSubject, email, displayName }) {
      const existing = (await query(
        "select * from admin_users where google_subject = $1",
        [googleSubject],
      ))[0];
      if (existing) {
        const rows = await query(
          "update admin_users set email = $2, display_name = $3, last_login_at = now() where id = $1 returning *",
          [existing.id, email, displayName || existing.display_name],
        );
        return userFrom(rows[0]);
      }
      const rows = await query(
        "insert into admin_users (id, google_subject, email, display_name) values ($1, $2, $3, $4) returning *",
        [randomUUID(), googleSubject, email, displayName || ""],
      );
      return userFrom(rows[0]);
    },
    async getUser(id) {
      return userFrom((await query("select * from admin_users where id = $1", [id]))[0]);
    },
    async getUserByEmail(email) {
      return userFrom((await query("select * from admin_users where email = $1", [email]))[0]);
    },
    async createDevice({ userId, deviceName }) {
      const rows = await query(
        `insert into admin_trusted_devices (id, user_id, device_name, last_method)
         values ($1, $2, $3, 'google') returning *`,
        [randomUUID(), userId, deviceName || "此裝置"],
      );
      return deviceFrom(rows[0]);
    },
    async getDevice(id) {
      return deviceFrom((await query("select * from admin_trusted_devices where id = $1", [id]))[0]);
    },
    async listDevices(userId) {
      const rows = await query(
        "select * from admin_trusted_devices where user_id = $1 order by last_used_at desc",
        [userId],
      );
      return rows.map(deviceFrom);
    },
    async updateDevice(id, patch) {
      const current = await this.getDevice(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      const rows = await query(
        `update admin_trusted_devices set
          device_name = $2, pin_hash = $3, pin_enabled = $4, passkey_enabled = $5,
          failed_attempts = $6, locked_until = $7, pin_reauth_required = $8,
          setup_skipped = $9, last_method = $10, last_used_at = $11, revoked_at = $12
         where id = $1 returning *`,
        [
          id, next.deviceName, next.pinHash, next.pinEnabled, next.passkeyEnabled,
          next.failedAttempts, next.lockedUntil, next.pinReauthRequired,
          next.setupSkipped, next.lastMethod, next.lastUsedAt, next.revokedAt,
        ],
      );
      return deviceFrom(rows[0]);
    },
    async revokeDevice(id) {
      const now = new Date().toISOString();
      await query("delete from admin_passkeys where device_id = $1", [id]);
      await query(
        "update admin_sessions set revoked_at = $2 where device_id = $1 and revoked_at is null",
        [id, now],
      );
      const rows = await query(
        `update admin_trusted_devices set
          revoked_at = $2, pin_hash = null, pin_enabled = false, passkey_enabled = false
         where id = $1 returning *`,
        [id, now],
      );
      return deviceFrom(rows[0]);
    },
    async createPasskey(row) {
      const rows = await query(
        `insert into admin_passkeys (id, user_id, device_id, credential_id, public_key, counter, transports)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [
          randomUUID(), row.userId, row.deviceId, row.credentialId, row.publicKey,
          row.counter || 0, JSON.stringify(row.transports || []),
        ],
      );
      return passkeyFrom(rows[0]);
    },
    async getPasskeyByCredentialId(credentialId) {
      return passkeyFrom((await query(
        "select * from admin_passkeys where credential_id = $1",
        [credentialId],
      ))[0]);
    },
    async listPasskeys(userId, deviceId) {
      const rows = deviceId
        ? await query("select * from admin_passkeys where user_id = $1 and device_id = $2", [userId, deviceId])
        : await query("select * from admin_passkeys where user_id = $1", [userId]);
      return rows.map(passkeyFrom);
    },
    async updatePasskey(id, patch) {
      const current = passkeyFrom((await query("select * from admin_passkeys where id = $1", [id]))[0]);
      if (!current) return null;
      const next = { ...current, ...patch };
      const rows = await query(
        "update admin_passkeys set counter = $2, last_used_at = $3, transports = $4 where id = $1 returning *",
        [id, next.counter, next.lastUsedAt, JSON.stringify(next.transports || [])],
      );
      return passkeyFrom(rows[0]);
    },
    async createSession({ userId, deviceId, method, tokenHash, expiresAt }) {
      const rows = await query(
        `insert into admin_sessions (id, user_id, device_id, method, token_hash, expires_at)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [randomUUID(), userId, deviceId || null, method, tokenHash, expiresAt],
      );
      return sessionFrom(rows[0]);
    },
    async getSessionByTokenHash(tokenHash) {
      return sessionFrom((await query(
        "select * from admin_sessions where token_hash = $1",
        [tokenHash],
      ))[0]);
    },
    async revokeSession(id) {
      const rows = await query(
        "update admin_sessions set revoked_at = now() where id = $1 returning *",
        [id],
      );
      return sessionFrom(rows[0]);
    },
    async revokeSessionsForDevice(deviceId) {
      await query(
        "update admin_sessions set revoked_at = now() where device_id = $1 and revoked_at is null",
        [deviceId],
      );
    },
    async createChallenge({ kind, userId, deviceId, value, expiresAt }) {
      const rows = await query(
        `insert into admin_auth_challenges (id, kind, user_id, device_id, value, expires_at)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [randomUUID(), kind, userId || null, deviceId || null, value, expiresAt],
      );
      const row = rows[0];
      return {
        id: row.id, kind: row.kind, userId: row.user_id, deviceId: row.device_id,
        value: row.value, expiresAt: toIso(row.expires_at), createdAt: toIso(row.created_at),
      };
    },
    async consumeChallenge(id) {
      const rows = await query("select * from admin_auth_challenges where id = $1", [id]);
      if (!rows[0]) return null;
      await query("delete from admin_auth_challenges where id = $1", [id]);
      if (new Date(rows[0].expires_at).getTime() <= Date.now()) return null;
      const row = rows[0];
      return {
        id: row.id, kind: row.kind, userId: row.user_id, deviceId: row.device_id,
        value: row.value, expiresAt: toIso(row.expires_at), createdAt: toIso(row.created_at),
      };
    },
    async consumeLatestChallenge(kind, userId, deviceId) {
      const rows = await query(
        `select * from admin_auth_challenges
         where kind = $1 and user_id = $2 and ($3::text is null or device_id = $3)
           and expires_at > now()
         order by created_at desc limit 1`,
        [kind, userId, deviceId || null],
      );
      if (!rows[0]) return null;
      await query("delete from admin_auth_challenges where id = $1", [rows[0].id]);
      const row = rows[0];
      return {
        id: row.id, kind: row.kind, userId: row.user_id, deviceId: row.device_id,
        value: row.value, expiresAt: toIso(row.expires_at), createdAt: toIso(row.created_at),
      };
    },
    async addAudit({ userId, deviceId, method, success }) {
      const rows = await query(
        `insert into admin_auth_audit (id, user_id, device_id, method, success)
         values ($1, $2, $3, $4, $5) returning *`,
        [randomUUID(), userId || null, deviceId || null, method, Boolean(success)],
      );
      const row = rows[0];
      return {
        id: row.id, userId: row.user_id, deviceId: row.device_id, method: row.method,
        success: Boolean(row.success), createdAt: toIso(row.created_at),
      };
    },
    async listAudit(userId) {
      const rows = userId
        ? await query("select * from admin_auth_audit where user_id = $1 order by created_at desc", [userId])
        : await query("select * from admin_auth_audit order by created_at desc", []);
      return rows.map((row) => ({
        id: row.id, userId: row.user_id, deviceId: row.device_id, method: row.method,
        success: Boolean(row.success), createdAt: toIso(row.created_at),
      }));
    },
  };
}

export async function ensureAdminAuthStore() {
  if (skipPostgres || process.env.NODE_TEST_CONTEXT) {
    store ??= createMemoryStore();
    return store;
  }
  if (store && store.__pg) return store;
  try {
    const { bindPostgresAdminAuthStore } = await import("./admin-auth-pg.ts");
    const pgStore = await bindPostgresAdminAuthStore();
    if (pgStore) {
      store = pgStore;
      store.__pg = true;
    }
  } catch {
    store ??= createMemoryStore();
  }
  return store;
}

export function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return secret;
}

export function passwordConfig() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = sessionSecret();
  if (!password?.trim() || !secret) return null;
  return { password, secret };
}

export function parseAllowedEmails(raw) {
  return new Set(String(raw || "").split(/[,\n]+/u).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const emails = parseAllowedEmails(process.env.ADMIN_ALLOWED_EMAILS);
  const secret = sessionSecret();
  if (!clientId || !clientSecret || emails.size === 0 || !secret) return null;
  return { clientId, clientSecret, emails, secret };
}

export function adminServiceEnabled() {
  return Boolean(sessionSecret() && (passwordConfig() || googleConfig()));
}

function json(body, status = 200, headers = {}) {
  const headerList = new Headers({
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    vary: "Cookie",
  });
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "set-cookie") continue;
    headerList.set(key, value);
  }
  const cookies = headers.setCookie || headers["set-cookie"];
  if (Array.isArray(cookies)) for (const cookie of cookies) headerList.append("set-cookie", cookie);
  else if (cookies) headerList.set("set-cookie", cookies);
  return new Response(JSON.stringify(body), { status, headers: headerList });
}

function redirect(location, cookies = []) {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    location,
    "cache-control": "private, no-store",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || fetchSite === "cross-site") return false;
  const configuredOrigin = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  let expectedOrigin;
  if (configuredOrigin) {
    try { expectedOrigin = new URL(configuredOrigin).origin; }
    catch { return false; }
  } else {
    expectedOrigin = new URL(request.url).origin;
  }
  return origin === expectedOrigin;
}

export function publicOrigin(request) {
  const configured = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) {
    try { return new URL(configured).origin; }
    catch { /* fall through */ }
  }
  return new URL(request.url).origin;
}

export function relyingPartyId(request) {
  const host = new URL(publicOrigin(request)).hostname;
  return host === "127.0.0.1" ? "localhost" : host;
}

function cookieValue(request, name) {
  const matches = (request.headers.get("cookie") || "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return "";
  return matches[0].slice(name.length + 1);
}

function serializeCookie(name, token, maxAge, sameSite = "Strict") {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}; Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`;
}

function constantEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  const length = Math.max(leftBytes.length, rightBytes.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  leftBytes.copy(paddedLeft);
  rightBytes.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && leftBytes.length === rightBytes.length;
}

function identityKey(secret) {
  return scryptSync(secret, "club-admin-identity-v2", 32);
}

function signPayload(label, payload, secret) {
  return createHmac("sha256", identityKey(secret)).update(JSON.stringify([label, payload])).digest("base64url");
}

function readSigned(request, name, label) {
  const secret = sessionSecret();
  if (!secret) return null;
  const token = cookieValue(request, name);
  if (!token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  if (!constantEqual(parts[1], signPayload(label, parts[0], secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) || data.iat > now || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSigned(name, label, data, maxAge, sameSite = "Strict") {
  const secret = sessionSecret();
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return serializeCookie(name, `${payload}.${signPayload(label, payload, secret)}`, maxAge, sameSite);
}

export function hashPin(pin) {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, PIN_KEYLEN, { N: PIN_N, r: PIN_R, p: PIN_P });
  return `scrypt$${PIN_N}$${PIN_R}$${PIN_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPin(pin, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (!salt.length || !expected.length) return false;
  const derived = scryptSync(pin, salt, expected.length, { N, r, p });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function validPin(value) {
  return typeof value === "string" && /^[0-9]{4}$/.test(value);
}

export function deviceNameFromUa(ua) {
  const value = String(ua || "");
  if (/OPPO|PACM00|CPH/i.test(value)) return "OPPO Android";
  if (/Android/i.test(value) && /Chrome/i.test(value)) return "Chrome Android";
  if (/Android/i.test(value)) return "Android";
  if (/iPhone|iPad/i.test(value)) return /CriOS/i.test(value) ? "Chrome iPhone" : "iPhone";
  if (/Windows/i.test(value) && /Chrome/i.test(value)) return "Chrome Windows";
  if (/Mac OS/i.test(value) && /Chrome/i.test(value) && !/Edg/i.test(value)) return "Chrome macOS";
  if (/Mac OS/i.test(value) && /Safari/i.test(value)) return "Safari macOS";
  return "此裝置";
}

export function safeNextPath(value, fallback = "/admin") {
  const raw = String(value || "").trim() || fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  try {
    const url = new URL(raw, "https://club.internal");
    if (!url.pathname.startsWith("/admin") && url.pathname !== "/follow-up") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

async function readDeviceRecord(request) {
  await ensureAdminAuthStore();
  const data = readSigned(request, DEVICE_COOKIE, "club-admin-device");
  if (!data?.deviceId || !data?.userId) return null;
  const device = await store.getDevice(data.deviceId);
  if (!device || device.userId !== data.userId || device.revokedAt) return null;
  return device;
}

export async function readV2Session(request) {
  await ensureAdminAuthStore();
  const data = readSigned(request, SESSION_COOKIE, "club-admin-v2-session");
  if (!data || data.v !== 2 || typeof data.sid !== "string" || typeof data.tokenHash !== "string") return null;
  const session = await store.getSessionByTokenHash(data.tokenHash);
  if (!session || session.id !== data.sid || session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  if (session.deviceId) {
    const device = await store.getDevice(session.deviceId);
    if (!device || device.revokedAt) return null;
  }
  return { ...session, method: data.method || session.method };
}

async function issueIdentityCookies({ user, device, method }) {
  await ensureAdminAuthStore();
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await store.createSession({
    userId: user.id,
    deviceId: device?.id,
    method,
    tokenHash,
    expiresAt: new Date((now + SESSION_SECONDS) * 1000).toISOString(),
  });
  const sessionCookie = writeSigned(SESSION_COOKIE, "club-admin-v2-session", {
    v: 2, sid: session.id, userId: user.id, method, tokenHash, iat: now, exp: now + SESSION_SECONDS, nonce,
  }, SESSION_SECONDS);
  const cookies = [sessionCookie];
  if (device) {
    await store.updateDevice(device.id, {
      lastUsedAt: new Date().toISOString(),
      lastMethod: method,
      pinReauthRequired: false,
      failedAttempts: method === "google" ? 0 : device.failedAttempts,
      lockedUntil: method === "google" ? null : device.lockedUntil,
    });
    cookies.push(writeSigned(DEVICE_COOKIE, "club-admin-device", {
      v: 1, deviceId: device.id, userId: user.id, iat: now, exp: now + DEVICE_SECONDS, nonce: randomBytes(8).toString("hex"),
    }, DEVICE_SECONDS));
  }
  await store.addAudit({ userId: user.id, deviceId: device?.id, method, success: true });
  return cookies;
}

export async function revokeCurrentV2Session(request) {
  const session = await readV2Session(request);
  if (session) await store.revokeSession(session.id);
}

export async function buildSessionView(request, { passwordSession = false } = {}) {
  await ensureAdminAuthStore();
  const googleEnabled = Boolean(googleConfig());
  const emergencyFallback = Boolean(passwordConfig());
  if (passwordSession) {
    return { authenticated: true, method: "password", googleEnabled, emergencyFallback, setupRequired: false };
  }
  const session = await readV2Session(request);
  if (session) {
    const user = await store.getUser(session.userId);
    const device = session.deviceId ? await store.getDevice(session.deviceId) : null;
    const trusted = device && !device.revokedAt;
    const setupRequired = Boolean(trusted && !device.pinEnabled && !device.passkeyEnabled && !device.setupSkipped);
    return {
      authenticated: true,
      method: session.method,
      googleEnabled,
      emergencyFallback,
      setupRequired,
      user: user ? { id: user.id, email: user.email, displayName: user.displayName } : undefined,
      device: trusted ? {
        id: device.id,
        name: device.deviceName,
        pinEnabled: device.pinEnabled,
        passkeyEnabled: device.passkeyEnabled,
      } : undefined,
    };
  }
  const device = await readDeviceRecord(request);
  const reauth = Boolean(device?.pinReauthRequired);
  const canQuick = Boolean(device && !reauth && (device.pinEnabled || device.passkeyEnabled));
  return {
    authenticated: false,
    googleEnabled,
    emergencyFallback,
    quickUnlock: canQuick ? {
      available: true,
      pin: Boolean(device.pinEnabled),
      passkey: Boolean(device.passkeyEnabled),
      deviceName: device.deviceName,
    } : { available: false },
  };
}

async function requireIdentity(request) {
  if (!adminServiceEnabled()) return json({ error: "管理功能尚未啟用" }, 503);
  const session = await readV2Session(request);
  if (!session) return json({ error: "請先登入管理後台" }, 401);
  return session;
}

async function readJson(request, maxBytes = 16_384) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("format");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("format");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("format");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("format");
  return parsed;
}

async function webauthn() {
  if (webauthnAdapter) return webauthnAdapter;
  const mod = await import("./admin-webauthn.mjs");
  return mod;
}

export async function handleGoogleStart(request) {
  const config = googleConfig();
  if (!config) return json({ error: "管理功能尚未啟用" }, 503);
  await ensureAdminAuthStore();
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const intent = url.searchParams.get("intent") === "reset-pin" ? "reset-pin" : "login";
  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const challenge = await store.createChallenge({
    kind: "google-oauth",
    value: JSON.stringify({ state, nonce, next, intent }),
    expiresAt: new Date(Date.now() + OAUTH_SECONDS * 1000).toISOString(),
  });
  const redirectUri = `${publicOrigin(request)}/api/admin/auth/callback`;
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", config.clientId);
  target.searchParams.set("redirect_uri", redirectUri);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", "openid email profile");
  target.searchParams.set("state", `${challenge.id}.${state}`);
  target.searchParams.set("nonce", nonce);
  target.searchParams.set("prompt", "select_account");
  const now = Math.floor(Date.now() / 1000);
  return redirect(target.toString(), [
    writeSigned(
      OAUTH_COOKIE,
      "club-admin-oauth",
      { v: 1, challengeId: challenge.id, state, iat: now, exp: now + OAUTH_SECONDS },
      OAUTH_SECONDS,
      "Lax",
    ),
  ]);
}

async function defaultGoogleIdentity(code, redirectUri, config) {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("token");
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string") throw new Error("token");
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.clientId,
  });
  return {
    sub: String(payload.sub || ""),
    email: String(payload.email || ""),
    name: String(payload.name || ""),
    email_verified: payload.email_verified === true,
  };
}

export async function handleGoogleCallback(request) {
  const config = googleConfig();
  if (!config) return redirect("/admin?error=oauth");
  await ensureAdminAuthStore();
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const stateParam = url.searchParams.get("state") || "";
  const signed = readSigned(request, OAUTH_COOKIE, "club-admin-oauth");
  const [challengeId, state] = stateParam.split(".");
  if (!signed || !challengeId || !state || signed.challengeId !== challengeId || signed.state !== state) {
    return redirect("/admin?error=oauth", [serializeCookie(OAUTH_COOKIE, "", 0, "Lax")]);
  }
  const challenge = await store.consumeChallenge(challengeId);
  if (!challenge) return redirect("/admin?error=oauth", [serializeCookie(OAUTH_COOKIE, "", 0, "Lax")]);
  let parsed;
  try { parsed = JSON.parse(challenge.value); }
  catch { return redirect("/admin?error=oauth", [serializeCookie(OAUTH_COOKIE, "", 0, "Lax")]); }
  if (parsed.state !== state) return redirect("/admin?error=oauth", [serializeCookie(OAUTH_COOKIE, "", 0, "Lax")]);
  const redirectUri = `${publicOrigin(request)}/api/admin/auth/callback`;
  let identity;
  try {
    identity = googleVerifier
      ? await googleVerifier({ code, redirectUri })
      : await defaultGoogleIdentity(code, redirectUri, config);
  } catch {
    return redirect("/admin?error=oauth", [serializeCookie(OAUTH_COOKIE, "", 0)]);
  }
  const email = String(identity.email || "").trim().toLowerCase();
  if (!identity.sub || !email || identity.email_verified === false) {
    await store.addAudit({ method: "google", success: false });
    return redirect("/admin?error=oauth", [serializeCookie(OAUTH_COOKIE, "", 0, "Lax")]);
  }
  if (!config.emails.has(email)) {
    await store.addAudit({ method: "google", success: false });
    return redirect("/admin?error=forbidden", [serializeCookie(OAUTH_COOKIE, "", 0, "Lax")]);
  }
  const user = await store.upsertUser({
    googleSubject: identity.sub,
    email,
    displayName: identity.name || email,
  });
  let device = await readDeviceRecord(request);
  if (!device || device.userId !== user.id) {
    device = await store.createDevice({
      userId: user.id,
      deviceName: deviceNameFromUa(request.headers.get("user-agent")),
    });
  }
  if (parsed.intent === "reset-pin") {
    await store.updateDevice(device.id, {
      pinHash: null,
      pinEnabled: false,
      pinReauthRequired: false,
      failedAttempts: 0,
      lockedUntil: null,
      setupSkipped: false,
    });
    device = await store.getDevice(device.id);
  }
  const cookies = await issueIdentityCookies({ request, user, device, method: "google" });
  cookies.push(serializeCookie(OAUTH_COOKIE, "", 0, "Lax"));
  const next = parsed.intent === "reset-pin" ? "/admin?setup=pin" : safeNextPath(parsed.next);
  return redirect(next, cookies);
}

function pinLockUntil(failedAttempts, now) {
  if (failedAttempts >= 15) return { reauth: true, until: null };
  if (failedAttempts === 10) return { reauth: false, until: new Date(now + 5 * 60 * 1000).toISOString() };
  if (failedAttempts === 5) return { reauth: false, until: new Date(now + 30 * 1000).toISOString() };
  return { reauth: false, until: null };
}

export async function handlePinSetup(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  if (session.method === "password") return json({ error: "請先使用 Google 登入此裝置" }, 403);
  let body;
  try { body = await readJson(request, 2048); }
  catch { return json({ error: "請提供有效資料" }, 400); }
  if (!validPin(body.pin) || !validPin(body.confirm)) return json({ error: "請輸入 4 碼數字 PIN" }, 400);
  if (body.pin !== body.confirm) return json({ error: "兩次 PIN 不一致" }, 400);
  let device = await readDeviceRecord(request);
  if (!device || device.userId !== session.userId) return json({ error: "請先使用 Google 登入此裝置" }, 403);
  const pinHash = hashPin(body.pin);
  await store.updateDevice(device.id, {
    pinHash,
    pinEnabled: true,
    failedAttempts: 0,
    lockedUntil: null,
    pinReauthRequired: false,
    setupSkipped: false,
    lastUsedAt: new Date().toISOString(),
  });
  return json({ ok: true, pinEnabled: true });
}

export async function handlePinDisable(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  let body = {};
  try { body = await readJson(request, 2048); }
  catch { body = {}; }
  const targetId = typeof body.deviceId === "string" ? body.deviceId : session.deviceId;
  const device = targetId ? await store.getDevice(targetId) : null;
  if (!device || device.userId !== session.userId || device.revokedAt) {
    return json({ error: "找不到裝置" }, 404);
  }
  await store.updateDevice(device.id, { pinHash: null, pinEnabled: false, failedAttempts: 0, lockedUntil: null });
  return json({ ok: true });
}

export async function handlePinUnlock(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站解鎖" }, 403);
  if (!adminServiceEnabled()) return json({ error: "管理功能尚未啟用" }, 503);
  await ensureAdminAuthStore();
  const device = await readDeviceRecord(request);
  if (!device || !device.pinEnabled || !device.pinHash) {
    await store.addAudit({ method: "pin", success: false, deviceId: device?.id, userId: device?.userId });
    return json({ error: "請先使用 Google 登入" }, 401);
  }
  if (device.pinReauthRequired) {
    await store.addAudit({ userId: device.userId, deviceId: device.id, method: "pin", success: false });
    return json({ error: "請改用 Google 登入", requireGoogle: true }, 403);
  }
  const now = Date.now();
  if (device.lockedUntil && new Date(device.lockedUntil).getTime() > now) {
    const retry = Math.ceil((new Date(device.lockedUntil).getTime() - now) / 1000);
    return json({ error: "嘗試過多，請稍後再試", retryAfter: retry }, 429, { "Retry-After": String(retry) });
  }
  let body;
  try { body = await readJson(request, 2048); }
  catch { return json({ error: "請提供有效資料" }, 400); }
  if (!validPin(body.pin)) {
    await store.addAudit({ userId: device.userId, deviceId: device.id, method: "pin", success: false });
    return json({ error: "PIN 不正確" }, 401);
  }
  if (!verifyPin(body.pin, device.pinHash)) {
    const failedAttempts = device.failedAttempts + 1;
    const lock = pinLockUntil(failedAttempts, now);
    await store.updateDevice(device.id, {
      failedAttempts,
      lockedUntil: lock.until,
      pinReauthRequired: lock.reauth,
    });
    await store.addAudit({ userId: device.userId, deviceId: device.id, method: "pin", success: false });
    if (lock.reauth) return json({ error: "請改用 Google 登入", requireGoogle: true }, 403);
    if (lock.until) {
      const retry = Math.ceil((new Date(lock.until).getTime() - now) / 1000);
      return json({ error: "PIN 不正確", retryAfter: retry }, 401, { "Retry-After": String(retry) });
    }
    return json({ error: "PIN 不正確" }, 401);
  }
  const user = await store.getUser(device.userId);
  if (!user) return json({ error: "請先使用 Google 登入" }, 401);
  await store.updateDevice(device.id, { failedAttempts: 0, lockedUntil: null, pinReauthRequired: false });
  const cookies = await issueIdentityCookies({ request, user, device, method: "pin" });
  return json({ ok: true, authenticated: true }, 200, { "set-cookie": cookies });
}

export async function handleSetupSkip(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  const device = await readDeviceRecord(request);
  if (!device || device.userId !== session.userId) return json({ error: "請先使用 Google 登入此裝置" }, 403);
  await store.updateDevice(device.id, { setupSkipped: true });
  return json({ ok: true });
}

export async function handleWebAuthnRegisterOptions(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  const user = await store.getUser(session.userId);
  const device = await readDeviceRecord(request);
  if (!user || !device || device.userId !== session.userId) {
    return json({ error: "請先使用 Google 登入此裝置" }, 403);
  }
  const existing = await store.listPasskeys(user.id);
  const adapter = await webauthn();
  const options = await adapter.registrationOptions({
    rpID: relyingPartyId(request),
    rpName: "淡江禪學社",
    userID: user.id,
    userName: user.email,
    userDisplayName: user.displayName || user.email,
    excludeCredentials: existing.map((row) => ({ id: row.credentialId, transports: row.transports })),
  });
  await store.createChallenge({
    kind: "webauthn-register",
    userId: user.id,
    deviceId: device.id,
    value: String(options.challenge),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  return json({ ok: true, options, challengeId: undefined });
}

export async function handleWebAuthnRegister(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  const device = await readDeviceRecord(request);
  if (!device || device.userId !== session.userId) return json({ error: "請先使用 Google 登入此裝置" }, 403);
  let body;
  try { body = await readJson(request, 32_768); }
  catch { return json({ error: "請提供有效資料" }, 400); }
  const challengeValue = typeof body.expectedChallenge === "string" ? body.expectedChallenge : "";
  const adapter = await webauthn();
  const stored = await store.consumeLatestChallenge("webauthn-register", session.userId, device.id);
  const expectedChallenge = stored?.value || challengeValue;
  if (!expectedChallenge) return json({ error: "請重新開始裝置解鎖設定" }, 400);
  try {
    const verified = await adapter.verifyRegistration({
      response: body.credential || body,
      expectedChallenge,
      expectedOrigin: publicOrigin(request),
      expectedRPID: relyingPartyId(request),
    });
    await store.createPasskey({
      userId: session.userId,
      deviceId: device.id,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      counter: verified.counter,
      transports: verified.transports || [],
    });
    await store.updateDevice(device.id, {
      passkeyEnabled: true,
      setupSkipped: false,
      lastUsedAt: new Date().toISOString(),
    });
    return json({ ok: true, passkeyEnabled: true });
  } catch {
    return json({ error: "無法驗證此裝置解鎖" }, 400);
  }
}

export async function handleWebAuthnLoginOptions(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站解鎖" }, 403);
  if (!adminServiceEnabled()) return json({ error: "管理功能尚未啟用" }, 503);
  await ensureAdminAuthStore();
  const device = await readDeviceRecord(request);
  if (!device || !device.passkeyEnabled || device.pinReauthRequired) {
    return json({ error: "請先使用 Google 登入" }, 401);
  }
  const passkeys = await store.listPasskeys(device.userId, device.id);
  if (!passkeys.length) return json({ error: "請先使用 Google 登入" }, 401);
  const adapter = await webauthn();
  const options = await adapter.authenticationOptions({
    rpID: relyingPartyId(request),
    allowCredentials: passkeys.map((row) => ({ id: row.credentialId, transports: row.transports })),
  });
  await store.createChallenge({
    kind: "webauthn-login",
    userId: device.userId,
    deviceId: device.id,
    value: String(options.challenge),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  return json({ ok: true, options });
}

export async function handleWebAuthnLogin(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站解鎖" }, 403);
  if (!adminServiceEnabled()) return json({ error: "管理功能尚未啟用" }, 503);
  await ensureAdminAuthStore();
  const device = await readDeviceRecord(request);
  if (!device || !device.passkeyEnabled || device.pinReauthRequired) {
    await store.addAudit({ method: "passkey", success: false, deviceId: device?.id, userId: device?.userId });
    return json({ error: "請先使用 Google 登入" }, 401);
  }
  let body;
  try { body = await readJson(request, 32_768); }
  catch { return json({ error: "請提供有效資料" }, 400); }
  const credential = body.credential || body;
  const credentialId = String(credential.id || credential.rawId || "");
  const passkey = credentialId ? await store.getPasskeyByCredentialId(credentialId) : null;
  if (!passkey || passkey.deviceId !== device.id) {
    await store.addAudit({ userId: device.userId, deviceId: device.id, method: "passkey", success: false });
    return json({ error: "無法驗證此裝置解鎖" }, 401);
  }
  const stored = await store.consumeLatestChallenge("webauthn-login", device.userId, device.id);
  const expectedChallenge = stored?.value || (typeof body.expectedChallenge === "string" ? body.expectedChallenge : "");
  if (!expectedChallenge) return json({ error: "請重新開始裝置解鎖" }, 400);
  const adapter = await webauthn();
  try {
    const verified = await adapter.verifyAuthentication({
      response: credential,
      expectedChallenge,
      expectedOrigin: publicOrigin(request),
      expectedRPID: relyingPartyId(request),
      credential: passkey,
    });
    await store.updatePasskey(passkey.id, {
      counter: verified.newCounter,
      lastUsedAt: new Date().toISOString(),
    });
    const user = await store.getUser(device.userId);
    const cookies = await issueIdentityCookies({ request, user, device, method: "passkey" });
    return json({ ok: true, authenticated: true }, 200, { "set-cookie": cookies });
  } catch {
    await store.addAudit({ userId: device.userId, deviceId: device.id, method: "passkey", success: false });
    return json({ error: "無法驗證此裝置解鎖" }, 401);
  }
}

export async function handleListDevices(request) {
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  const current = await readDeviceRecord(request);
  const devices = await store.listDevices(session.userId);
  return json({
    ok: true,
    currentDeviceId: current?.id,
    devices: devices.map((device) => ({
      id: device.id,
      name: device.deviceName,
      pinEnabled: device.pinEnabled,
      passkeyEnabled: device.passkeyEnabled,
      lastMethod: device.lastMethod,
      createdAt: device.createdAt,
      lastUsedAt: device.lastUsedAt,
      revokedAt: device.revokedAt,
      current: current?.id === device.id,
    })),
  });
}

export async function handleRenameDevice(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  let body;
  try { body = await readJson(request, 2048); }
  catch { return json({ error: "請提供有效資料" }, 400); }
  const id = String(body.id || "");
  const name = String(body.deviceName || "").trim().slice(0, 80);
  if (!id || !name) return json({ error: "請提供裝置名稱" }, 400);
  const device = await store.getDevice(id);
  if (!device || device.userId !== session.userId || device.revokedAt) return json({ error: "找不到裝置" }, 404);
  await store.updateDevice(id, { deviceName: name });
  return json({ ok: true });
}

export async function handleRevokeDevice(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站設定" }, 403);
  const session = await requireIdentity(request);
  if (session instanceof Response) return session;
  let body;
  try { body = await readJson(request, 2048); }
  catch { return json({ error: "請提供有效資料" }, 400); }
  const id = String(body.id || "");
  const device = await store.getDevice(id);
  if (!device || device.userId !== session.userId) return json({ error: "找不到裝置" }, 404);
  await store.revokeDevice(id);
  const cookies = [];
  if (session.deviceId === id) {
    await store.revokeSession(session.id);
    cookies.push(serializeCookie(SESSION_COOKIE, "", 0));
    cookies.push(serializeCookie(DEVICE_COOKIE, "", 0));
  }
  return json({ ok: true, currentRevoked: session.deviceId === id }, 200, { "set-cookie": cookies });
}

export async function handleAdminAuth(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const rest = path.replace(/^\/api\/admin\/auth\/?/, "");
  if (request.method === "GET" && rest === "google") return handleGoogleStart(request);
  if (request.method === "GET" && rest === "callback") return handleGoogleCallback(request);
  if (rest === "pin" && request.method === "POST") return handlePinSetup(request);
  if (rest === "pin/disable" && request.method === "POST") return handlePinDisable(request);
  if (rest === "unlock" && request.method === "POST") return handlePinUnlock(request);
  if (rest === "setup/skip" && request.method === "POST") return handleSetupSkip(request);
  if (rest === "webauthn/register/options") return handleWebAuthnRegisterOptions(request);
  if (rest === "webauthn/register") return handleWebAuthnRegister(request);
  if (rest === "webauthn/login/options") return handleWebAuthnLoginOptions(request);
  if (rest === "webauthn/login") return handleWebAuthnLogin(request);
  if (rest === "devices" && request.method === "GET") return handleListDevices(request);
  if (rest === "devices/rename") return handleRenameDevice(request);
  if (rest === "devices/revoke") return handleRevokeDevice(request);
  return json({ error: "Not found" }, 404);
}

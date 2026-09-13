export const SESSION_COOKIE: string;
export const DEVICE_COOKIE: string;
export const OAUTH_COOKIE: string;
export function getAdminAuthStore(): unknown;
export function setGoogleIdentityVerifier(
  fn: (input: { code: string; redirectUri: string }) => Promise<{
    sub: string;
    email: string;
    name?: string;
    email_verified?: boolean;
  }>,
): void;
export function setWebAuthnAdapter(adapter: {
  registrationOptions: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  verifyRegistration: (input: Record<string, unknown>) => Promise<{
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string[];
  }>;
  authenticationOptions: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  verifyAuthentication: (input: Record<string, unknown>) => Promise<{ newCounter: number }>;
}): void;
export function createSqlStore(
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
): unknown;
export function ensureAdminAuthStore(): Promise<unknown>;
export function passwordConfig(): { password: string; secret: string };
export function passwordIsConfigured(): boolean;
export function sessionSecret(): string;
export function webauthnOrigin(request: Request): string;
export function relyingPartyId(request: Request): string;
export function issuePasswordLogin(request: Request): Promise<string[]>;
export function adminServiceEnabled(): boolean;
export function readV2Session(request: Request): Promise<unknown>;
export function revokeCurrentV2Session(request: Request): Promise<void>;
export function buildSessionView(
  request: Request,
  options?: { passwordSession?: boolean },
): Promise<{
  authenticated: boolean;
  passwordEnabled?: boolean;
  googleEnabled?: boolean;
  emergencyFallback?: boolean;
  method?: string;
  setupRequired?: boolean;
  user?: { id: string; email: string; displayName: string };
  device?: { id: string; name: string; pinEnabled: boolean; passkeyEnabled: boolean };
  quickUnlock?: { available: boolean; pin?: boolean; passkey?: boolean; deviceName?: string };
}>;
export function handleAdminAuth(request: Request): Promise<Response>;
export function handleGoogleStart(request: Request): Promise<Response>;
export function handleGoogleCallback(request: Request): Promise<Response>;
export function handlePinSetup(request: Request): Promise<Response>;
export function handlePinDisable(request: Request): Promise<Response>;
export function handlePinUnlock(request: Request): Promise<Response>;
export function handleSetupSkip(request: Request): Promise<Response>;
export function handleWebAuthnRegisterOptions(request: Request): Promise<Response>;
export function handleWebAuthnRegister(request: Request): Promise<Response>;
export function handleWebAuthnLoginOptions(request: Request): Promise<Response>;
export function handleWebAuthnLogin(request: Request): Promise<Response>;
export function handleListDevices(request: Request): Promise<Response>;
export function handleRenameDevice(request: Request): Promise<Response>;
export function handleRevokeDevice(request: Request): Promise<Response>;
export function hashPin(pin: string): string;
export function verifyPin(pin: string, encoded: string): boolean;
export function parseAllowedEmails(raw: string | undefined): Set<string>;

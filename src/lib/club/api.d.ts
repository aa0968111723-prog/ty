export const SECURITY_HEADERS: Record<string, string>;
export function handleHealth(): Promise<Response>;
export function handleRegister(request: Request): Promise<Response>;
export function handleResult(request: Request): Promise<Response>;
export function handleLeaderboard(request: Request): Promise<Response>;

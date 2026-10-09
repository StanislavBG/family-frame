import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createOAuthState(
  userId: string,
  secret: string,
  now: number = Date.now(),
): { state: string; nonce: string } {
  const nonce = randomBytes(24).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ userId, nonce, ts: now })).toString("base64url");
  const signature = sign(payload, secret).toString("base64url");
  return { state: `${payload}.${signature}`, nonce };
}

export function verifyOAuthState(
  state: string,
  nonceCookie: string | undefined,
  secret: string,
  now: number = Date.now(),
): { userId: string } | null {
  try {
    if (!nonceCookie || typeof state !== "string") return null;
    const parts = state.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, signature] = parts;
    if (!safeEqual(Buffer.from(signature, "base64url"), sign(payload, secret))) return null;

    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.userId !== "string" || typeof data.nonce !== "string" || typeof data.ts !== "number") return null;
    if (now - data.ts > STATE_TTL_MS || data.ts > now + 60_000) return null;
    if (!safeEqual(Buffer.from(data.nonce), Buffer.from(nonceCookie))) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

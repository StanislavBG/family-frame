import { createHash, timingSafeEqual } from "node:crypto";

export const SERVICE_TOKEN_PREFIX = "ff_svc_";

const BODY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * True when `token` is a well-formed service token whose SHA-256 equals
 * `expectedSha256Hex` (the EVENTS_SERVICE_TOKEN_SHA256 secret). An unset,
 * blank or malformed hash never verifies.
 */
export function verifyServiceToken(token: string, expectedSha256Hex: string | undefined): boolean {
  if (typeof token !== "string" || typeof expectedSha256Hex !== "string") return false;
  const expected = expectedSha256Hex.trim();
  if (!HASH_PATTERN.test(expected)) return false;
  if (!token.startsWith(SERVICE_TOKEN_PREFIX)) return false;
  if (!BODY_PATTERN.test(token.slice(SERVICE_TOKEN_PREFIX.length))) return false;
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

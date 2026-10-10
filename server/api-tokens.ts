import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getFirebaseDb } from "./firebase";

export const API_TOKEN_PREFIX = "ff_pat_";
export const API_TOKEN_SCOPES = [
  "calendar:read",
  "calendar:write",
  "mail:read",
  "mail:write",
  "data:read",
  "data:write",
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

const MAX_TOKENS_PER_USER = 10;
const MAX_NAME_LENGTH = 60;
const LAST_USED_INTERVAL_MS = 60 * 60 * 1000;
const TOKEN_BODY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ApiTokenRecord {
  id: string;
  userId: string;
  name: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface TokenStore {
  get(hash: string): Promise<ApiTokenRecord | null>;
  set(hash: string, rec: ApiTokenRecord): Promise<void>;
  remove(hash: string): Promise<void>;
  listByUser(userId: string): Promise<Array<{ hash: string; rec: ApiTokenRecord }>>;
}

export class ApiTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiTokenError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(
  store: TokenStore,
  userId: string,
  name: string,
  scopes: ApiTokenScope[],
): Promise<{ token: string; record: ApiTokenRecord }> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) throw new ApiTokenError("Token name is required");
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ApiTokenError(`Token name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ApiTokenError("At least one scope is required");
  }
  for (const scope of scopes) {
    if (!(API_TOKEN_SCOPES as readonly string[]).includes(scope)) {
      throw new ApiTokenError(`Unknown scope: ${String(scope)}`);
    }
  }

  const existing = await store.listByUser(userId);
  if (existing.length >= MAX_TOKENS_PER_USER) {
    throw new ApiTokenError(`Token limit reached (${MAX_TOKENS_PER_USER})`);
  }

  const token = API_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const record: ApiTokenRecord = {
    id: randomUUID(),
    userId,
    name: trimmed,
    scopes: Array.from(new Set(scopes)),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await store.set(hashToken(token), record);
  return { token, record };
}

export async function verifyApiToken(
  store: TokenStore,
  token: string,
): Promise<{ userId: string; scopes: ApiTokenScope[]; id: string } | null> {
  if (typeof token !== "string" || !token.startsWith(API_TOKEN_PREFIX)) return null;
  if (!TOKEN_BODY_PATTERN.test(token.slice(API_TOKEN_PREFIX.length))) return null;

  const hash = hashToken(token);
  const rec = await store.get(hash);
  if (!rec) return null;

  const last = rec.lastUsedAt ? Date.parse(rec.lastUsedAt) : NaN;
  if (Number.isNaN(last) || Date.now() - last >= LAST_USED_INTERVAL_MS) {
    try {
      await store.set(hash, { ...rec, lastUsedAt: new Date().toISOString() });
    } catch {
      // best-effort bookkeeping; never fail authentication over it
    }
  }
  return { userId: rec.userId, scopes: rec.scopes, id: rec.id };
}

export async function listApiTokens(store: TokenStore, userId: string): Promise<ApiTokenRecord[]> {
  const entries = await store.listByUser(userId);
  return entries
    .map((e) => e.rec)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function revokeApiToken(store: TokenStore, userId: string, id: string): Promise<boolean> {
  const entries = await store.listByUser(userId);
  const match = entries.find((e) => e.rec.id === id && e.rec.userId === userId);
  if (!match) return false;
  await store.remove(match.hash);
  return true;
}

// Firebase drops null children, so lastUsedAt is normalized on read.
function normalize(raw: any): ApiTokenRecord {
  return { ...raw, scopes: Array.isArray(raw.scopes) ? raw.scopes : [], lastUsedAt: raw.lastUsedAt ?? null };
}

export const firebaseTokenStore: TokenStore = {
  async get(hash) {
    const snap = await getFirebaseDb().ref(`apiTokens/${hash}`).once("value");
    const val = snap.val();
    return val ? normalize(val) : null;
  },
  async set(hash, rec) {
    await getFirebaseDb().ref(`apiTokens/${hash}`).set(rec);
  },
  async remove(hash) {
    await getFirebaseDb().ref(`apiTokens/${hash}`).remove();
  },
  async listByUser(userId) {
    const snap = await getFirebaseDb()
      .ref("apiTokens")
      .orderByChild("userId")
      .equalTo(userId)
      .once("value");
    const val = snap.val() as Record<string, any> | null;
    if (!val) return [];
    return Object.entries(val).map(([hash, raw]) => ({ hash, rec: normalize(raw) }));
  },
};

// Dependency-free Gmail REST client (fetch + OAuth refresh-token auth).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_LIST = 100;
const MAX_TEXT = 200000;
const TOKEN_SKEW_MS = 60_000;

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  headers: Map<string, string[]>;
  text: string;
}

export interface GmailPayload {
  mimeType?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string };
  parts?: GmailPayload[];
}

export interface GmailClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface GmailClient {
  listMessageIds(query: string, max: number): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage>;
  ensureLabel(name: string): Promise<string>;
  addLabels(id: string, labelIds: string[]): Promise<void>;
}

export function parseHeaders(headers: GmailPayload["headers"]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const h of headers ?? []) {
    if (!h.name) continue;
    const key = h.name.toLowerCase();
    const list = out.get(key);
    if (list) list.push(h.value ?? "");
    else out.set(key, [h.value ?? ""]);
  }
  return out;
}

function decodeBody(part: GmailPayload): string {
  const data = part.body?.data;
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function findPart(payload: GmailPayload, mime: string): string | null {
  if (payload.mimeType === mime) {
    const s = decodeBody(payload);
    if (s) return s;
  }
  for (const p of payload.parts ?? []) {
    const found = findPart(p, mime);
    if (found) return found;
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripHtml(html: string): string {
  const noBlocks = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = noBlocks.replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, " "));
}

export function extractText(payload: GmailPayload): string {
  const plain = findPart(payload, "text/plain");
  let text: string;
  if (plain !== null) text = plain;
  else {
    const html = findPart(payload, "text/html");
    text = html !== null ? stripHtml(html) : "";
  }
  return text.trim().slice(0, MAX_TEXT);
}

export function createGmailClient(opts: GmailClientOptions): GmailClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 15000;
  let token: { value: string; expiresAt: number } | null = null;
  const labelCache = new Map<string, string>();

  async function request(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await doFetch(url, { ...init, signal: ctrl.signal });
    } catch (err) {
      if (ctrl.signal.aborted) throw new Error(`Gmail request timed out after ${timeoutMs}ms: ${url}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt - TOKEN_SKEW_MS) return token.value;
    const res = await request(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        refresh_token: opts.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 400 && body.error === "invalid_grant") {
        throw new GmailAuthError(
          "Gmail refresh token was rejected (invalid_grant). Re-run `npm run inbox:run -- auth` to authorize again.",
        );
      }
      throw new Error(`Gmail token refresh failed: ${res.status} ${body.error ?? ""}`.trim());
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await request(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(`Gmail ${init.method ?? "GET"} ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async listMessageIds(query, max) {
      const limit = Math.max(0, Math.min(Math.floor(max), MAX_LIST));
      const ids: string[] = [];
      let pageToken: string | undefined;
      while (ids.length < limit) {
        const params = new URLSearchParams({ q: query, maxResults: String(limit - ids.length) });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params}`);
        for (const m of page.messages ?? []) {
          if (ids.length < limit) ids.push(m.id);
        }
        pageToken = page.nextPageToken;
        if (!pageToken) break;
      }
      return ids;
    },

    async getMessage(id) {
      const m = await api<{ id: string; threadId: string; internalDate: string; payload?: GmailPayload }>(
        `/messages/${encodeURIComponent(id)}?format=full`,
      );
      const payload = m.payload ?? {};
      return {
        id: m.id,
        threadId: m.threadId,
        internalDate: new Date(Number(m.internalDate)).toISOString(),
        headers: parseHeaders(payload.headers),
        text: extractText(payload),
      };
    },

    async ensureLabel(name) {
      const cached = labelCache.get(name);
      if (cached) return cached;
      const { labels } = await api<{ labels?: { id: string; name: string }[] }>("/labels");
      for (const l of labels ?? []) labelCache.set(l.name, l.id);
      let id = labelCache.get(name);
      if (!id) {
        const created = await api<{ id: string }>("/labels", { method: "POST", body: { name } });
        id = created.id;
        labelCache.set(name, id);
      }
      return id;
    },

    async addLabels(id, labelIds) {
      await api(`/messages/${encodeURIComponent(id)}/modify`, { method: "POST", body: { addLabelIds: labelIds } });
    },
  };
}

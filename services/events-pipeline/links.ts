import { lookup as dnsLookup } from "node:dns/promises";
import { isPublicAddress, isSafeFetchUrl } from "../../server/url-guards";
import { registrableDomain } from "../../shared/events-sources";

export type LinkStatus = "ok" | "dead" | "moved" | "blocked" | "refused" | "error";

export interface LinkResult {
  status: LinkStatus;
  httpStatus?: number;
  finalUrl?: string;
  detail?: string;
}

export type LinkStats = Record<LinkStatus, number>;

export interface LinkCheckerDeps {
  fetch?: typeof fetch;
  lookup?: (host: string, opts: { all: true }) => Promise<{ address: string; family: number }[]>;
  timeoutMs?: number;
  maxRedirects?: number;
  concurrency?: number;
  userAgent?: string;
  /** Pause before the single retry (default 500 ms). */
  retryDelayMs?: number;
}

const DEAD_CODES = /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|CERT_.*|ERR_TLS_.*|ERR_SSL_.*|.*_CERT_.*|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_.*)$/;

function errCode(err: unknown): string {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return String(e?.cause?.code ?? e?.code ?? "");
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}

export function createLinkChecker(deps: LinkCheckerDeps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const doLookup = deps.lookup ?? ((h: string, o: { all: true }) => dnsLookup(h, o));
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const maxRedirects = deps.maxRedirects ?? 5;
  const concurrency = Math.max(1, deps.concurrency ?? 6);
  const userAgent = deps.userAgent ?? "FamilyFrameEvents/1.0 (link check)";
  const retryDelayMs = deps.retryDelayMs ?? 500;

  const cache = new Map<string, Promise<LinkResult>>();
  const counts: LinkStats = { ok: 0, dead: 0, moved: 0, blocked: 0, refused: 0, error: 0 };

  let active = 0;
  const waiting: (() => void)[] = [];
  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active++;
      return;
    }
    await new Promise<void>((r) => waiting.push(r));
  }
  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }

  // Returns a refusal reason, or null when the host resolves only to public addresses.
  async function guardHop(url: string): Promise<LinkResult | null> {
    if (!isSafeFetchUrl(url)) return { status: "refused", detail: "url not allowed" };
    const host = new URL(url).hostname.toLowerCase();
    let addrs: { address: string; family: number }[];
    try {
      addrs = await doLookup(host, { all: true });
    } catch (err) {
      return { status: "dead", detail: `dns failure (${errCode(err) || "lookup"}) for ${host}` };
    }
    if (!addrs.length) return { status: "dead", detail: `dns returned no address for ${host}` };
    for (const a of addrs) {
      if ((a.family !== 4 && a.family !== 6) || !isPublicAddress(a.address, a.family)) {
        return { status: "refused", detail: `non-public address for ${host}` };
      }
    }
    return null;
  }

  // One request with a single retry for 5xx and timeouts. Returns a Response or a final LinkResult.
  async function request(url: string): Promise<Response | LinkResult> {
    const host = new URL(url).hostname;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
      const last = attempt === 1;
      try {
        const res = await doFetch(url, {
          method: "GET",
          redirect: "manual",
          headers: { "user-agent": userAgent },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status >= 500 && res.status < 600) {
          await discard(res);
          if (last) return { status: "dead", httpStatus: res.status, detail: `http ${res.status} from ${host}` };
          continue;
        }
        return res;
      } catch (err) {
        if (isTimeout(err)) {
          if (last) return { status: "dead", detail: `timeout from ${host}` };
          continue;
        }
        const code = errCode(err);
        if (DEAD_CODES.test(code)) return { status: "dead", detail: `${code} from ${host}` };
        return { status: "error", detail: `fetch failed for ${host}${code ? ` (${code})` : ""}` };
      }
    }
    return { status: "error", detail: `fetch failed for ${host}` };
  }

  async function run(startUrl: string): Promise<LinkResult> {
    const start = isSafeFetchUrl(startUrl) ? new URL(startUrl) : null;
    let current = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const refusal = await guardHop(current);
      if (refusal) return refusal;
      const out = await request(current);
      if (!(out instanceof Response)) return out;
      const res = out;
      await discard(res);
      const s = res.status;
      if (s >= 200 && s < 300) return { status: "ok", httpStatus: s, finalUrl: current };
      if (s === 404 || s === 410) return { status: "dead", httpStatus: s, finalUrl: current };
      if (s === 401 || s === 403 || s === 429) return { status: "blocked", httpStatus: s, finalUrl: current };
      if (s >= 300 && s < 400) {
        const location = res.headers.get("location");
        if (!location) return { status: "error", httpStatus: s, detail: "redirect without location" };
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { status: "error", httpStatus: s, detail: "invalid redirect location" };
        }
        if (start) {
          const a = registrableDomain(start.hostname);
          const b = registrableDomain(next.hostname);
          if (a && b && a !== b) {
            return { status: "moved", httpStatus: s, finalUrl: next.toString(), detail: `redirected to ${next.hostname}` };
          }
          if (start.pathname !== "/" && next.pathname === "/" && !next.search) {
            return { status: "moved", httpStatus: s, finalUrl: next.toString(), detail: "redirected to site root" };
          }
        }
        if (hop === maxRedirects) return { status: "dead", httpStatus: s, detail: "too many redirects" };
        current = next.toString();
        continue;
      }
      return { status: "error", httpStatus: s, finalUrl: current, detail: `unexpected http ${s}` };
    }
    return { status: "dead", detail: "too many redirects" };
  }

  function check(url: string): Promise<LinkResult> {
    const hit = cache.get(url);
    if (hit) return hit;
    const p = (async () => {
      await acquire();
      try {
        const r = await run(url);
        counts[r.status]++;
        return r;
      } catch {
        counts.error++;
        return { status: "error", detail: "unexpected failure" } as LinkResult;
      } finally {
        release();
      }
    })();
    cache.set(url, p);
    return p;
  }

  return { check, stats: (): LinkStats => ({ ...counts }) };
}

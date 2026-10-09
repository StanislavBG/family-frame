import { BABY_RADIO_LIBRARY, BUILT_IN_MOOD_STATIONS } from "@shared/schema";

export interface SourceCheckResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  title?: string;
  reason?: string;
  attempts: number;
}

export interface CheckOptions {
  fetchImpl?: typeof fetch;
  retries?: number;
  delayMs?: number;
  timeoutMs?: number;
}

export interface BabySongSources {
  audio: Array<{ id: string; title: string; url: string }>;
  youtube: Array<{ videoId: string; stations: string[] }>;
}

export function collectBabySongSources(): BabySongSources {
  const audio = BABY_RADIO_LIBRARY.map((t) => ({ id: t.id, title: t.title, url: t.url }));
  const byVideo = new Map<string, string[]>();
  for (const station of BUILT_IN_MOOD_STATIONS) {
    for (const videoId of station.videoIds) {
      const stations = byVideo.get(videoId) ?? [];
      if (!stations.includes(station.id)) stations.push(station.id);
      byVideo.set(videoId, stations);
    }
  }
  const youtube = Array.from(byVideo, ([videoId, stations]) => ({ videoId, stations }));
  return { audio, youtube };
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetch with bounded retries on network errors, 429 and 5xx. Never throws.
 * `handle` maps a non-retryable (or final) response to a result.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: CheckOptions,
  handle: (res: Response) => Promise<Omit<SourceCheckResult, "attempts">>,
): Promise<SourceCheckResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const retries = Math.max(0, opts.retries ?? 2);
  const delayMs = opts.delayMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 15000;

  let lastReason = "unknown error";
  let lastStatus: number | undefined;
  let attempts = 0;

  for (let i = 0; i <= retries; i++) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    attempts++;
    try {
      const res = await fetchImpl(url, {
        ...init,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (isRetryable(res.status)) {
        lastStatus = res.status;
        lastReason = `HTTP ${res.status}`;
        await res.body?.cancel().catch(() => {});
        continue;
      }
      const result = await handle(res);
      await res.body?.cancel().catch(() => {});
      return { ...result, attempts };
    } catch (err) {
      lastStatus = undefined;
      lastReason = `network error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { ok: false, status: lastStatus, reason: lastReason, attempts };
}

export function checkAudioUrl(url: string, opts: CheckOptions = {}): Promise<SourceCheckResult> {
  return fetchWithRetry(url, { method: "GET", headers: { Range: "bytes=0-1023" } }, opts, async (res) => {
    const contentType = res.headers.get("content-type") ?? undefined;
    if (res.status !== 200 && res.status !== 206) {
      return { ok: false, status: res.status, contentType, reason: `HTTP ${res.status}` };
    }
    if (!contentType || !contentType.toLowerCase().startsWith("audio/")) {
      return {
        ok: false,
        status: res.status,
        contentType,
        reason: `unexpected content-type ${contentType ?? "(none)"}`,
      };
    }
    return { ok: true, status: res.status, contentType };
  });
}

export function checkYouTubeVideo(videoId: string, opts: CheckOptions = {}): Promise<SourceCheckResult> {
  const params = new URLSearchParams({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    format: "json",
  });
  const url = `https://www.youtube.com/oembed?${params.toString()}`;
  return fetchWithRetry(url, { method: "GET" }, opts, async (res) => {
    if (res.status === 200) {
      let title: string | undefined;
      try {
        const body = (await res.json()) as { title?: unknown };
        if (typeof body.title === "string") title = body.title;
      } catch {
        // title is optional
      }
      return { ok: true, status: 200, title };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, reason: "embedding disabled" };
    }
    if (res.status === 400 || res.status === 404) {
      return { ok: false, status: res.status, reason: "unavailable" };
    }
    return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
  });
}

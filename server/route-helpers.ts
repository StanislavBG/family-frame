export const FETCH_TIMEOUT_MS = 10_000;
export const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;

// Cache an async computation for ms; concurrent callers share one in-flight run, failures aren't cached.
export function memoTTL<T>(fn: () => Promise<T>, ms: number): () => Promise<T> {
  let cached: { value: Promise<T>; expires: number } | null = null;
  return () => {
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = fn();
    cached = { value, expires: Date.now() + ms };
    value.catch(() => { if (cached?.value === value) cached = null; });
    return value;
  };
}

// Status-only health probe: always release the body so no stream stays open.
export async function discardBody(response: globalThis.Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

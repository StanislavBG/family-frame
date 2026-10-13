export type DeliverOutcome = { ok: true; result: unknown } | { ok: false; status: number; error: string };

export interface InboxFfClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface InboxFfClient {
  deliver(body: unknown): Promise<DeliverOutcome>;
}

function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Family Frame baseUrl is not a valid URL");
  }
  const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !local) {
    throw new Error("Family Frame baseUrl must be https (http only for localhost or 127.0.0.1)");
  }
  return url.toString().replace(/\/+$/, "");
}

function errorMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON; fall through
  }
  return `Family Frame responded with status ${status}`;
}

/** Status 0 in a failed outcome means a network error or timeout. */
export function createInboxFfClient(options: InboxFfClientOptions): InboxFfClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20000;

  return {
    async deliver(body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${baseUrl}/api/service/inbox/deliver`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await res.text();
        if (!res.ok) return { ok: false, status: res.status, error: errorMessage(text, res.status) };
        try {
          return { ok: true, result: JSON.parse(text) };
        } catch {
          return { ok: false, status: 502, error: "Family Frame returned invalid JSON" };
        }
      } catch (error) {
        const reason = controller.signal.aborted ? "timeout" : error instanceof Error ? error.name : "unknown";
        return { ok: false, status: 0, error: `Family Frame request failed (${reason})` };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

import { z } from "zod";
import { EVENTS_LIMITS, eventPreferencesSchema, type RecommendationInput } from "../../shared/events";
import { householdAddressSchema } from "../../shared/household";

const RETRY_DELAY_MS = 2000;

export class FfClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "FfClientError";
  }
}

export interface NotSharing {
  notSharing: true;
}

const looseObject = z.object({}).passthrough();

const householdItemSchema = z
  .object({
    householdId: z.string().min(1),
    homeName: z.string().optional(),
    address: householdAddressSchema,
    timezone: z.string().optional(),
    memberAges: z.array(z.number()),
    preferences: eventPreferencesSchema,
    learned: looseObject,
    lastPublishedAt: z.string().nullable(),
    consentVersion: z.union([z.string(), z.number()]).nullable(),
  })
  .passthrough();

const householdsSchema = z.object({ households: z.array(householdItemSchema) }).passthrough();

const stateRecommendationSchema = z
  .object({
    eventId: z.string(),
    fingerprint: z.string(),
    title: z.string(),
    start: z.string(),
    end: z.string().optional(),
    category: z.string(),
    status: z.string(),
    response: z.string(),
    feedback: z.unknown().nullable(),
    calendarLinked: z.boolean(),
    recommendedAt: z.string(),
    withdrawn: z.boolean(),
  })
  .passthrough();

const stateSchema = z
  .object({
    householdId: z.string(),
    recommendations: z.array(stateRecommendationSchema),
    busy: z.array(z.unknown()),
    feedback: z.array(z.unknown()),
    preferences: eventPreferencesSchema,
    learned: looseObject,
  })
  .passthrough();

const upsertResultSchema = z.object({
  created: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  ids: z.array(z.string()),
  changed: z.array(z.string()),
});

const withdrawSchema = z.object({ deleted: z.boolean() });

const runMetaSchema = z
  .object({ lastRunId: z.string(), lastPublishedAt: z.string(), lastRun: z.unknown() })
  .passthrough();

export type FfHousehold = z.infer<typeof householdItemSchema>;
export type FfState = z.infer<typeof stateSchema>;
export type FfUpsertResult = z.infer<typeof upsertResultSchema>;
export type FfRunMeta = z.infer<typeof runMetaSchema>;

export interface FfRun {
  runId: string;
  kind: "discover" | "refresh";
  startedAt: string;
  finishedAt: string;
  stats: Record<string, number>;
}

export interface FfClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Delay before the single retry; defaults to 2 s. */
  retryDelayMs?: number;
}

export interface FfClient {
  listHouseholds(): Promise<FfHousehold[]>;
  getState(householdId: string, feedbackSince?: string): Promise<FfState | NotSharing>;
  putRecommendations(
    householdId: string,
    body: { runId: string; recommendations: RecommendationInput[] },
  ): Promise<FfUpsertResult | NotSharing>;
  withdraw(householdId: string, eventId: string): Promise<{ deleted: boolean } | NotSharing>;
  recordRun(householdId: string, run: FfRun): Promise<FfRunMeta | NotSharing>;
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFfClient(options: FfClientOptions): FfClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const { token } = options;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;

  async function attempt(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      return { status: res.status, text: await res.text() };
    } finally {
      clearTimeout(timer);
    }
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

  // Performs the request with one retry on network errors and 5xx; returns the final non-retried response.
  async function send(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
    let last: { status: number; text: string } | undefined;
    let networkError: unknown;
    for (let i = 0; i < 2; i++) {
      if (i > 0) await sleep(retryDelayMs);
      try {
        last = await attempt(method, path, body);
        networkError = undefined;
      } catch (error) {
        last = undefined;
        networkError = error;
        continue;
      }
      if (last.status < 500) return last;
    }
    if (last) throw new FfClientError(last.status, errorMessage(last.text, last.status));
    const reason = networkError instanceof Error ? networkError.name : "unknown";
    throw new FfClientError(0, `Family Frame request failed (${reason})`);
  }

  function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, text: string, what: string): T {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new FfClientError(502, `Family Frame returned invalid JSON for ${what}`);
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new FfClientError(502, `Family Frame ${what} response failed validation: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}`.trim());
    }
    return result.data;
  }

  async function request<T>(method: string, path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, what: string, body?: unknown): Promise<T> {
    const res = await send(method, path, body);
    if (res.status < 200 || res.status >= 300) throw new FfClientError(res.status, errorMessage(res.text, res.status));
    return parse(schema, res.text, what);
  }

  async function perHousehold<T>(method: string, path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, what: string, body?: unknown): Promise<T | NotSharing> {
    const res = await send(method, path, body);
    if (res.status === 404) return { notSharing: true };
    if (res.status < 200 || res.status >= 300) throw new FfClientError(res.status, errorMessage(res.text, res.status));
    return parse(schema, res.text, what);
  }

  const hh = (householdId: string) => `/api/service/events/households/${encodeURIComponent(householdId)}`;

  return {
    async listHouseholds() {
      const data = await request("GET", "/api/service/events/households", householdsSchema, "households");
      return data.households;
    },

    getState(householdId, feedbackSince) {
      const query = feedbackSince ? `?feedbackSince=${encodeURIComponent(feedbackSince)}` : "";
      return perHousehold("GET", `${hh(householdId)}/state${query}`, stateSchema, "state");
    },

    async putRecommendations(householdId, { runId, recommendations }) {
      const total: FfUpsertResult = { created: 0, updated: 0, unchanged: 0, ids: [], changed: [] };
      for (let i = 0; i < recommendations.length; i += EVENTS_LIMITS.maxBatch) {
        const batch = recommendations.slice(i, i + EVENTS_LIMITS.maxBatch);
        const result = await perHousehold("PUT", `${hh(householdId)}/recommendations`, upsertResultSchema, "upsert", { runId, recommendations: batch });
        if ("notSharing" in result) return result;
        total.created += result.created;
        total.updated += result.updated;
        total.unchanged += result.unchanged;
        total.ids.push(...result.ids);
        total.changed.push(...result.changed);
      }
      return total;
    },

    withdraw(householdId, eventId) {
      return perHousehold("DELETE", `${hh(householdId)}/recommendations/${encodeURIComponent(eventId)}`, withdrawSchema, "withdraw");
    },

    recordRun(householdId, run) {
      return perHousehold("POST", `${hh(householdId)}/runs`, runMetaSchema, "run", run);
    },
  };
}

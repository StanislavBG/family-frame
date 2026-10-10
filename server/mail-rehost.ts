import { getFirebaseDb } from "./firebase";
import { MAIL_LIMITS, type EmailSummary } from "@shared/agent-data";
import { mailService, type MailService } from "./mail-service";
import { mediaImporter, rehostIdForUrl, type MediaImporter } from "./media-import";

// Rehosts the imageUrls of mailbox emails into the media store and links the resulting ids
// in the email's mediaIds. Runs in bounded batches an agent calls repeatedly; no background job.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 200;
const ERROR_MAX = 200;

export interface RehostDeps {
  mail: MailService;
  importer: Pick<MediaImporter, "importFromUrl">;
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  now?(): Date;
}

export interface RehostOptions {
  emailIds?: string[];
  limit?: number;
}

export interface RehostFailure {
  emailId: string;
  url: string;
  error: string;
}

export interface RehostResult {
  processed: number;
  imported: number;
  failed: RehostFailure[];
  remaining: number;
}

interface FailureRecord {
  url: string;
  error: string;
  attempts: number;
  lastAt: string;
}

const failuresPath = (userId: string) => `mailbox/${userId}/rehostFailures`;

async function runLimited<T>(tasks: (() => Promise<T>)[], max: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(max, tasks.length) }, worker));
  return results;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}

export function createMailRehoster(deps: RehostDeps) {
  const { mail, importer } = deps;

  const pendingUrls = (e: EmailSummary, failures: Record<string, FailureRecord>): string[] => {
    const have = new Set(e.mediaIds);
    return e.imageUrls.filter((u) => {
      const id = rehostIdForUrl(u);
      return !have.has(id) && (failures[id]?.attempts ?? 0) < MAX_ATTEMPTS;
    });
  };

  async function scan(userId: string, emailIds: string[] | undefined, failures: Record<string, FailureRecord>) {
    const candidates: EmailSummary[] = [];
    if (emailIds) {
      for (const id of Array.from(new Set(emailIds))) {
        const e = await mail.getEmail(userId, id);
        if (e && pendingUrls(e, failures).length) candidates.push(e);
      }
      return candidates;
    }
    // Bounded by the mailbox cap (MAIL_LIMITS.mailboxMax), so the full scan stays small.
    let before: string | undefined;
    for (;;) {
      const page = await mail.listEmails(userId, { limit: PAGE_SIZE, before });
      for (const e of page.emails) if (pendingUrls(e, failures).length) candidates.push(e);
      if (!page.nextBefore) break;
      before = page.nextBefore;
    }
    return candidates;
  }

  async function rehostEmailImages(userId: string, opts: RehostOptions = {}): Promise<RehostResult> {
    const rawLimit = Math.floor(Number(opts.limit ?? DEFAULT_LIMIT));
    const limit = Number.isFinite(rawLimit) ? Math.min(MAX_LIMIT, Math.max(1, rawLimit)) : DEFAULT_LIMIT;
    const stamp = () => (deps.now ? deps.now() : new Date()).toISOString();

    const raw = await deps.get(failuresPath(userId));
    const failures: Record<string, FailureRecord> = raw && typeof raw === "object" ? { ...raw } : {};

    const candidates = await scan(userId, opts.emailIds, failures);
    const batch = candidates.slice(0, limit);
    let remaining = candidates.length - batch.length;

    const failed: RehostFailure[] = [];
    let imported = 0;

    for (const summary of batch) {
      const urls = pendingUrls(summary, failures);
      const outcomes = await runLimited(
        urls.map((url) => async () => {
          try {
            await importer.importFromUrl(userId, { url, tags: ["email"], emailIds: [summary.id] });
            return { url, error: null as string | null };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { url, error: msg.slice(0, ERROR_MAX) || "Import failed" };
          }
        }),
        MAX_CONCURRENCY,
      );

      const newIds: string[] = [];
      for (const o of outcomes) {
        const id = rehostIdForUrl(o.url);
        if (o.error === null) {
          newIds.push(id);
          imported++;
          continue;
        }
        failed.push({ emailId: summary.id, url: o.url, error: o.error });
        // Only the host is stored: full URLs may carry tokens in the query string.
        failures[id] = { url: hostOf(o.url), error: o.error, attempts: (failures[id]?.attempts ?? 0) + 1, lastAt: stamp() };
        await deps.set(`${failuresPath(userId)}/${id}`, failures[id]);
      }

      if (newIds.length) {
        const full = await mail.getEmail(userId, summary.id);
        if (full) {
          // Server-only fields are re-derived by the mail service (readAt is preserved there).
          const { ingestedAt, updatedAt, readAt, ...rest } = full;
          const mediaIds = Array.from(new Set([...full.mediaIds, ...newIds])).slice(0, MAIL_LIMITS.mediaIdsMax);
          const input: Record<string, unknown> = { ...rest, mediaIds };
          for (const k of Object.keys(input)) if (Array.isArray(input[k]) && (input[k] as unknown[]).length === 0) delete input[k];
          await mail.upsertEmails(userId, { emails: [input] });
          summary.mediaIds = mediaIds;
        }
      }
      if (pendingUrls(summary, failures).length) remaining++;
    }

    return { processed: batch.length, imported, failed, remaining };
  }

  return { rehostEmailImages };
}

export type MailRehoster = ReturnType<typeof createMailRehoster>;

export const mailRehoster: MailRehoster = createMailRehoster({
  mail: mailService,
  importer: mediaImporter,
  async get(path) {
    return (await getFirebaseDb().ref(path).once("value")).val();
  },
  async set(path, value) {
    await getFirebaseDb().ref(path).set(value);
  },
});

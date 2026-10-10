import { getFirebaseDb } from "./firebase";
import {
  MAIL_LIMITS,
  upsertEmailsSchema,
  type EmailMessage,
  type EmailSummary,
} from "@shared/agent-data";

export class MailError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MailError";
  }
}

export interface MailDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  // Multi-path update: keys are relative paths ("index/abc"), null deletes.
  update(path: string, values: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  now?(): Date;
}

export interface ListEmailsOptions {
  limit?: number;
  before?: string;
  label?: string;
  kind?: string;
  unreadOnly?: boolean;
  q?: string;
  personId?: string;
}

const root = (userId: string) => `mailbox/${userId}`;

function deriveSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

// RTDB rejects undefined and drops empty arrays/null; strip undefined before writing.
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSummary(raw: any): EmailSummary {
  return {
    ...raw,
    snippet: raw.snippet ?? "",
    to: Array.isArray(raw.to) ? raw.to : [],
    cc: Array.isArray(raw.cc) ? raw.cc : [],
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    // Media ids are stored as given and never checked against the media store.
    mediaIds: Array.isArray(raw.mediaIds) ? raw.mediaIds : [],
    personIds: Array.isArray(raw.personIds) ? Array.from(new Set<string>(raw.personIds)) : [],
    readAt: raw.readAt ?? null,
  };
}

function normalizeIndex(index: any): EmailSummary[] {
  if (!index || typeof index !== "object") return [];
  return Object.values(index)
    .filter((v) => v && typeof v === "object")
    .map(normalizeSummary);
}

function byReceivedDesc(a: EmailSummary, b: EmailSummary): number {
  const diff = Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createMailService(deps: MailDeps) {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();

  async function readIndex(userId: string): Promise<EmailSummary[]> {
    return normalizeIndex(await deps.get(`${root(userId)}/index`));
  }

  return {
    async upsertEmails(userId: string, input: unknown) {
      const parsed = upsertEmailsSchema.safeParse(input);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue.path.join(".");
        throw new MailError(path ? `${path}: ${issue.message}` : issue.message, 400);
      }
      const batch = parsed.data.emails;
      const seen = new Set<string>();
      for (const e of batch) {
        if (seen.has(e.id)) throw new MailError(`Duplicate email id in batch: ${e.id}`, 400);
        seen.add(e.id);
      }

      const existing = new Map((await readIndex(userId)).map((e) => [e.id, e]));
      const stamp = now();
      const values: Record<string, any> = {};
      let created = 0;
      let updated = 0;

      for (const e of batch) {
        const { text, ...rest } = e;
        const prev = existing.get(e.id);
        const summary = normalizeSummary({
          ...rest,
          snippet: e.snippet ?? deriveSnippet(text),
          ingestedAt: prev?.ingestedAt ?? stamp,
          updatedAt: stamp,
          readAt: prev?.readAt ?? null,
        });
        if (prev) updated++;
        else created++;
        existing.set(e.id, summary);
        const { readAt, ...stored } = summary;
        values[`index/${e.id}`] = clean(readAt ? { ...stored, readAt } : stored);
        values[`bodies/${e.id}`] = { text };
      }

      let pruned = 0;
      if (existing.size > MAIL_LIMITS.mailboxMax) {
        const oldestFirst = Array.from(existing.values()).sort(byReceivedDesc).reverse();
        for (const old of oldestFirst.slice(0, existing.size - MAIL_LIMITS.mailboxMax)) {
          values[`index/${old.id}`] = null;
          values[`bodies/${old.id}`] = null;
          pruned++;
        }
      }

      await deps.update(root(userId), values);
      return { created, updated, ids: batch.map((e) => e.id), pruned };
    },

    async listEmails(userId: string, opts: ListEmailsOptions = {}) {
      const rawLimit = Number(opts.limit);
      const limit = Number.isFinite(rawLimit) && opts.limit !== undefined
        ? Math.min(MAIL_LIMITS.listLimitMax, Math.max(1, Math.floor(rawLimit)))
        : MAIL_LIMITS.listLimitDefault;

      // Whole-index read is bounded by the MAIL_LIMITS.mailboxMax (2000) cap.
      let emails = await readIndex(userId);
      if (opts.unreadOnly) emails = emails.filter((e) => e.readAt === null);
      if (opts.label) emails = emails.filter((e) => e.labels.includes(opts.label!));
      if (opts.kind) emails = emails.filter((e) => e.kind === opts.kind);
      if (opts.personId) emails = emails.filter((e) => e.personIds.includes(opts.personId!));
      if (opts.q) {
        const q = opts.q.toLowerCase();
        emails = emails.filter((e) =>
          [e.subject, e.from.name, e.from.email, e.snippet].some((f) => f && f.toLowerCase().includes(q)),
        );
      }
      emails.sort(byReceivedDesc);
      if (opts.before) {
        const cutoff = Date.parse(opts.before);
        if (!Number.isNaN(cutoff)) emails = emails.filter((e) => Date.parse(e.receivedAt) < cutoff);
      }
      const page = emails.slice(0, limit);
      const nextBefore = emails.length > limit ? page[page.length - 1].receivedAt : null;
      return { emails: page, nextBefore };
    },

    async getEmail(userId: string, id: string): Promise<EmailMessage | null> {
      const raw = await deps.get(`${root(userId)}/index/${id}`);
      if (!raw) return null;
      const body = await deps.get(`${root(userId)}/bodies/${id}`);
      return { ...normalizeSummary(raw), text: body?.text ?? "" };
    },

    async setRead(userId: string, ids: string[] | "all", read: boolean) {
      const index = await readIndex(userId);
      const wanted = ids === "all" ? null : new Set(ids);
      const stamp = now();
      const values: Record<string, any> = {};
      let updated = 0;
      for (const e of index) {
        if (wanted && !wanted.has(e.id)) continue;
        if ((e.readAt !== null) === read) continue;
        values[`index/${e.id}/readAt`] = read ? stamp : null;
        updated++;
      }
      if (updated > 0) await deps.update(root(userId), values);
      return { updated };
    },

    async deleteEmail(userId: string, id: string): Promise<boolean> {
      const raw = await deps.get(`${root(userId)}/index/${id}`);
      if (!raw) return false;
      await deps.update(root(userId), { [`index/${id}`]: null, [`bodies/${id}`]: null });
      return true;
    },

    async unreadCount(userId: string): Promise<number> {
      return (await readIndex(userId)).filter((e) => e.readAt === null).length;
    },
  };
}

export type MailService = ReturnType<typeof createMailService>;

let instance: MailService | null = null;
function defaultService(): MailService {
  if (!instance) {
    instance = createMailService({
      async get(path) {
        return (await getFirebaseDb().ref(path).once("value")).val();
      },
      async set(path, value) {
        await getFirebaseDb().ref(path).set(value);
      },
      async update(path, values) {
        await getFirebaseDb().ref(path).update(values);
      },
      async remove(path) {
        await getFirebaseDb().ref(path).remove();
      },
    });
  }
  return instance;
}

// Lazy: Firebase is only touched when a method is called, never on import.
export const mailService: MailService = {
  upsertEmails: (...args) => defaultService().upsertEmails(...args),
  listEmails: (...args) => defaultService().listEmails(...args),
  getEmail: (...args) => defaultService().getEmail(...args),
  setRead: (...args) => defaultService().setRead(...args),
  deleteEmail: (...args) => defaultService().deleteEmail(...args),
  unreadCount: (...args) => defaultService().unreadCount(...args),
};

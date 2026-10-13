import { randomBytes } from "node:crypto";
import { getFirebaseDb, getUserData } from "./firebase";
import { mailService, type MailService } from "./mail-service";
import {
  deliverRequestSchema,
  generateInboxKey,
  inboxSourceSchema,
  personSlug,
  type InboxSource,
} from "@shared/household-inbox";

export class HouseholdInboxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "HouseholdInboxError";
  }
}

export interface HouseholdInboxDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  // Multi-path update: keys are paths relative to `path` ('' = database root), null deletes.
  update(path: string, values: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  now?(): Date;
  random?(n: number): Uint8Array;
}

export interface InboxState {
  enabled: boolean;
  key: string | null;
  sources: InboxSource[];
  organize: { enabled: boolean; at?: string };
}

const ROOT = "householdInbox";
const KEYS = "householdInboxKeys";
const MAX_KEY_ATTEMPTS = 5;
const MAX_HELD = 50;
const MAIL_ID_MAX = 128;

export interface HouseholdInboxMailDeps {
  mail: Pick<MailService, "upsertEmails">;
  getPeople(userId: string): Promise<{ id: string; name: string }[]>;
}

export type DeliverResult =
  | { status: "unknown" }
  | { status: "dropped" }
  | { status: "verification"; householdId: string }
  | { status: "held"; householdId: string }
  | { status: "delivered"; householdId: string; mailId: string; personId?: string; organize: boolean };

interface HeldEntry {
  source: string;
  personSlug?: string;
  heldAt: string;
  message: {
    id: string;
    receivedAt: string;
    from: { name?: string; email: string };
    subject: string;
    text: string;
  };
}

// RTDB keys cannot contain . # $ [ ] /
export function sourceKey(email: string): string {
  return email.trim().toLowerCase().replace(/[.#$\[\]/]/g, "_");
}

export function createHouseholdInboxService(deps: HouseholdInboxDeps, mailDeps: HouseholdInboxMailDeps) {
  const nowIso = () => (deps.now ? deps.now() : new Date()).toISOString();
  const random = deps.random ?? ((n: number) => new Uint8Array(randomBytes(n)));
  const path = (userId: string) => `${ROOT}/${userId}`;

  async function getState(userId: string): Promise<InboxState> {
    const raw = await deps.get(path(userId));
    const sources: InboxSource[] = [];
    if (raw?.sources && typeof raw.sources === "object") {
      for (const value of Object.values(raw.sources)) {
        const parsed = inboxSourceSchema.safeParse(value);
        if (parsed.success) sources.push(parsed.data);
      }
    }
    sources.sort((a, b) => {
      const pa = a.status === "pending" ? 0 : 1;
      const pb = b.status === "pending" ? 0 : 1;
      return pa - pb || a.email.localeCompare(b.email);
    });
    const organize: InboxState["organize"] = { enabled: raw?.organize?.enabled === true };
    if (typeof raw?.organize?.at === "string") organize.at = raw.organize.at;
    return {
      enabled: raw?.enabled === true,
      key: typeof raw?.key === "string" ? raw.key : null,
      sources,
      organize,
    };
  }

  async function allocateKey(): Promise<string> {
    for (let i = 0; i < MAX_KEY_ATTEMPTS; i++) {
      const key = generateInboxKey(random);
      if ((await deps.get(`${KEYS}/${key}`)) == null) return key;
    }
    throw new HouseholdInboxError("Could not allocate an inbox key, try again", 503);
  }

  async function enable(userId: string): Promise<InboxState> {
    const raw = await deps.get(path(userId));
    if (typeof raw?.key === "string") {
      await deps.update("", { [`${path(userId)}/enabled`]: true, [`${KEYS}/${raw.key}`]: userId });
    } else {
      const key = await allocateKey();
      await deps.update("", {
        [`${path(userId)}/key`]: key,
        [`${path(userId)}/enabled`]: true,
        [`${path(userId)}/createdAt`]: nowIso(),
        [`${KEYS}/${key}`]: userId,
      });
    }
    return getState(userId);
  }

  async function disable(userId: string): Promise<InboxState> {
    const raw = await deps.get(path(userId));
    if (raw) await deps.update(path(userId), { enabled: false });
    return getState(userId);
  }

  async function rotate(userId: string): Promise<InboxState> {
    const raw = await deps.get(path(userId));
    if (typeof raw?.key !== "string") throw new HouseholdInboxError("Household inbox is not set up", 404);
    const key = await allocateKey();
    await deps.update("", {
      [`${path(userId)}/key`]: key,
      [`${KEYS}/${raw.key}`]: null,
      [`${KEYS}/${key}`]: userId,
    });
    return getState(userId);
  }

  async function setSourceStatus(
    userId: string,
    email: string,
    status: InboxSource["status"],
  ): Promise<InboxState> {
    const sk = sourceKey(email);
    const existing = await deps.get(`${path(userId)}/sources/${sk}`);
    if (!existing) throw new HouseholdInboxError("Unknown source", 404);
    await deps.update(`${path(userId)}/sources/${sk}`, { status });
    if (status === "approved") await releaseHeld(userId, existing.email ?? email);
    else if (status === "blocked") await dropHeld(userId, existing.email ?? email);
    return getState(userId);
  }

  async function readHeld(userId: string, email: string): Promise<[string, HeldEntry][]> {
    const raw = await deps.get(`${path(userId)}/held`);
    if (!raw || typeof raw !== "object") return [];
    const wanted = email.trim().toLowerCase();
    return Object.entries<HeldEntry>(raw).filter(
      ([, h]) => typeof h?.source === "string" && h.source.toLowerCase() === wanted && h.message,
    );
  }

  async function dropHeld(userId: string, email: string): Promise<void> {
    const entries = await readHeld(userId, email);
    if (entries.length === 0) return;
    const values: Record<string, any> = {};
    for (const [id] of entries) values[id] = null;
    await deps.update(`${path(userId)}/held`, values);
  }

  async function toMailEmails(userId: string, entries: HeldEntry[]) {
    const people = await mailDeps.getPeople(userId);
    return entries.map((h) => {
      const person = h.personSlug ? people.find((p) => personSlug(p.name) === h.personSlug) : undefined;
      return {
        person,
        email: {
          id: `hh-${h.message.id}`.slice(0, MAIL_ID_MAX),
          receivedAt: h.message.receivedAt,
          from: h.message.from,
          subject: h.message.subject,
          text: h.message.text,
          source: "household-email",
          labels: ["household-email"],
          personIds: person ? [person.id] : [],
        },
      };
    });
  }

  async function releaseHeld(userId: string, email: string): Promise<void> {
    const entries = await readHeld(userId, email);
    if (entries.length === 0) return;
    const mapped = await toMailEmails(userId, entries.map(([, h]) => h));
    await mailDeps.mail.upsertEmails(userId, { emails: mapped.map((m) => m.email) });
    await dropHeld(userId, email);
  }

  async function deliver(input: unknown): Promise<DeliverResult> {
    const req = deliverRequestSchema.parse(input);
    const userId = await resolveKey(req.key);
    if (!userId) return { status: "unknown" };
    const sk = sourceKey(req.source);
    const existingRaw = await deps.get(`${path(userId)}/sources/${sk}`);
    const parsedExisting = inboxSourceSchema.safeParse(existingRaw);
    const existing = parsedExisting.success ? parsedExisting.data : null;

    if (req.verification) {
      const record: InboxSource = {
        email: req.source,
        // an approved (or blocked) source keeps its decision; a new one starts pending
        status: existing?.status ?? "pending",
        firstSeenAt: existing?.firstSeenAt ?? nowIso(),
        verifyUrl: req.verification.confirmUrl,
        verifyRequestedAt: nowIso(),
      };
      await deps.set(`${path(userId)}/sources/${sk}`, record);
      return { status: "verification", householdId: userId };
    }

    const message = req.message!;
    if (existing?.status === "blocked") return { status: "dropped" };

    if (existing?.status !== "approved" || !req.authenticated) {
      if (!existing) {
        const record: InboxSource = { email: req.source, status: "pending", firstSeenAt: nowIso() };
        await deps.set(`${path(userId)}/sources/${sk}`, record);
      }
      const entry: HeldEntry = {
        source: req.source,
        ...(req.personSlug ? { personSlug: req.personSlug } : {}),
        heldAt: nowIso(),
        message,
      };
      const values: Record<string, any> = { [message.id]: entry };
      const held = ((await deps.get(`${path(userId)}/held`)) ?? {}) as Record<string, HeldEntry>;
      const all = { ...held, [message.id]: entry };
      const ids = Object.keys(all);
      if (ids.length > MAX_HELD) {
        ids.sort((a, b) => Date.parse(all[a].message?.receivedAt) - Date.parse(all[b].message?.receivedAt) || (a < b ? -1 : 1));
        for (const id of ids.slice(0, ids.length - MAX_HELD)) values[id] = null;
      }
      await deps.update(`${path(userId)}/held`, values);
      return { status: "held", householdId: userId };
    }

    const [mapped] = await toMailEmails(userId, [
      { source: req.source, personSlug: req.personSlug, heldAt: nowIso(), message },
    ]);
    await mailDeps.mail.upsertEmails(userId, { emails: [mapped.email] });
    const organize = (await deps.get(`${path(userId)}/organize/enabled`)) === true;
    return {
      status: "delivered",
      householdId: userId,
      mailId: mapped.email.id,
      ...(mapped.person ? { personId: mapped.person.id } : {}),
      organize,
    };
  }

  async function setOrganize(userId: string, enabled: boolean): Promise<InboxState> {
    await deps.set(`${path(userId)}/organize`, { enabled, at: nowIso() });
    return getState(userId);
  }

  async function resolveKey(key: string): Promise<string | null> {
    const userId = await deps.get(`${KEYS}/${key}`);
    if (typeof userId !== "string") return null;
    const enabled = await deps.get(`${path(userId)}/enabled`);
    return enabled === true ? userId : null;
  }

  return { getState, enable, disable, rotate, setSourceStatus, setOrganize, resolveKey, deliver };
}

export type HouseholdInboxService = ReturnType<typeof createHouseholdInboxService>;

export const householdInboxService = createHouseholdInboxService(
  {
    async get(path) {
      return (await getFirebaseDb().ref(path).once("value")).val();
    },
    async set(path, value) {
      await getFirebaseDb().ref(path).set(value);
    },
    async update(path, values) {
      await getFirebaseDb().ref(path || undefined).update(values);
    },
    async remove(path) {
      await getFirebaseDb().ref(path).remove();
    },
  },
  {
    mail: mailService,
    getPeople: async (uid) => (await getUserData(uid))?.people ?? [],
  },
);

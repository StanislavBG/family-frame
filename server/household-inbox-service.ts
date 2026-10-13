import { randomBytes } from "node:crypto";
import { getFirebaseDb } from "./firebase";
import { generateInboxKey, inboxSourceSchema, type InboxSource } from "@shared/household-inbox";

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

// RTDB keys cannot contain . # $ [ ] /
export function sourceKey(email: string): string {
  return email.trim().toLowerCase().replace(/[.#$\[\]/]/g, "_");
}

export function createHouseholdInboxService(deps: HouseholdInboxDeps) {
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
    return getState(userId);
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

  return { getState, enable, disable, rotate, setSourceStatus, setOrganize, resolveKey };
}

export type HouseholdInboxService = ReturnType<typeof createHouseholdInboxService>;

export const householdInboxService = createHouseholdInboxService({
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
});

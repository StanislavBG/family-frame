import { getFirebaseDb } from "./firebase";
import {
  EVENTS_SHARING_CONSENT_VERSION,
  consentLogEntrySchema,
  eventsSharingSchema,
  householdAddressSchema,
  householdProfileSchema,
  isAddressComplete,
  type ConsentLogEntry,
  type EventsSharing,
  type HouseholdAddress,
  type HouseholdProfile,
} from "@shared/household";

export class HouseholdProfileError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "HouseholdProfileError";
  }
}

export interface HouseholdProfileDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  // Multi-path update: keys are relative paths, null deletes.
  update(path: string, values: Record<string, any>): Promise<void>;
  // Appends a child with a generated key and resolves to that key.
  push(path: string, value: any): Promise<string>;
  // Resolves to the children of `path` keyed by child key, or null when empty.
  list(path: string): Promise<Record<string, any> | null>;
  now?(): Date;
}

export interface SharingHousehold {
  userId: string;
  address: HouseholdAddress;
  eventsSharing: EventsSharing;
}

const ROOT = "householdProfiles";
const NO_CONSENT_ADDRESS = "Add your street address, city and country first";

// Firebase rejects undefined values; drop them (shallowly) before writing.
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function parseProfile(raw: any): HouseholdProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const { consentLog: _consentLog, ...rest } = raw;
  const parsed = householdProfileSchema.safeParse(rest);
  return parsed.success ? parsed.data : null;
}

export function createHouseholdProfileService(deps: HouseholdProfileDeps) {
  const nowIso = () => (deps.now ? deps.now() : new Date()).toISOString();
  const profilePath = (userId: string) => `${ROOT}/${userId}`;

  async function getProfile(userId: string): Promise<HouseholdProfile> {
    const raw = await deps.get(profilePath(userId));
    return parseProfile(raw) ?? { eventsSharing: { enabled: false } };
  }

  async function logConsent(userId: string, action: ConsentLogEntry["action"], at: string, version: number) {
    const entry: ConsentLogEntry = consentLogEntrySchema.parse({ at, action, consentVersion: version });
    await deps.push(`${profilePath(userId)}/consentLog`, entry);
  }

  // Writes the address (or clears it when `address` is null). If sharing is on
  // and the resulting address is incomplete, sharing is revoked and logged.
  async function writeAddress(userId: string, address: HouseholdAddress | null): Promise<HouseholdProfile> {
    const current = await getProfile(userId);
    const at = nowIso();
    const values: Record<string, any> = { address: address ? stripUndefined(address) : null, updatedAt: at };
    const revoke = current.eventsSharing.enabled && !isAddressComplete(address);
    if (revoke) {
      values.eventsSharing = stripUndefined({ ...current.eventsSharing, enabled: false, revokedAt: at });
    }
    await deps.update(profilePath(userId), values);
    if (revoke) {
      await logConsent(userId, "revoked", at, current.eventsSharing.consentVersion ?? EVENTS_SHARING_CONSENT_VERSION);
    }
    return getProfile(userId);
  }

  async function putAddress(userId: string, input: unknown): Promise<HouseholdProfile> {
    const parsed = householdAddressSchema.safeParse(input);
    if (!parsed.success) {
      throw new HouseholdProfileError(
        `Invalid address: ${parsed.error.issues.map((i) => `${i.path.join(".") || "address"} ${i.message}`).join("; ")}`,
        400,
      );
    }
    return writeAddress(userId, parsed.data);
  }

  async function clearAddress(userId: string): Promise<HouseholdProfile> {
    return writeAddress(userId, null);
  }

  async function setEventsSharing(userId: string, enabled: boolean): Promise<HouseholdProfile> {
    const current = await getProfile(userId);
    if (current.eventsSharing.enabled === enabled) return current;
    if (enabled && !isAddressComplete(current.address)) {
      throw new HouseholdProfileError(NO_CONSENT_ADDRESS, 409);
    }
    const at = nowIso();
    const eventsSharing: EventsSharing = enabled
      ? { enabled: true, consentVersion: EVENTS_SHARING_CONSENT_VERSION, consentedAt: at }
      : stripUndefined({ ...current.eventsSharing, enabled: false, revokedAt: at });
    await deps.update(profilePath(userId), { eventsSharing, updatedAt: at });
    await logConsent(
      userId,
      enabled ? "granted" : "revoked",
      at,
      enabled ? EVENTS_SHARING_CONSENT_VERSION : (current.eventsSharing.consentVersion ?? EVENTS_SHARING_CONSENT_VERSION),
    );
    return getProfile(userId);
  }

  async function listSharingHouseholds(): Promise<SharingHousehold[]> {
    const all = await deps.list(ROOT);
    if (!all || typeof all !== "object") return [];
    const out: SharingHousehold[] = [];
    for (const [userId, raw] of Object.entries(all)) {
      const profile = parseProfile(raw);
      if (!profile || !profile.address) continue;
      const sharing = eventsSharingSchema.safeParse(profile.eventsSharing);
      if (!sharing.success) continue;
      if (
        sharing.data.enabled &&
        isAddressComplete(profile.address) &&
        sharing.data.consentVersion === EVENTS_SHARING_CONSENT_VERSION
      ) {
        out.push({ userId, address: profile.address, eventsSharing: sharing.data });
      }
    }
    return out;
  }

  return { getProfile, putAddress, clearAddress, setEventsSharing, listSharingHouseholds };
}

export type HouseholdProfileService = ReturnType<typeof createHouseholdProfileService>;

export const householdProfileService = createHouseholdProfileService({
  async get(path) {
    return (await getFirebaseDb().ref(path).once("value")).val();
  },
  async set(path, value) {
    await getFirebaseDb().ref(path).set(value);
  },
  async update(path, values) {
    await getFirebaseDb().ref(path).update(values);
  },
  async push(path, value) {
    const ref = getFirebaseDb().ref(path).push();
    await ref.set(value);
    return ref.key as string;
  },
  async list(path) {
    return (await getFirebaseDb().ref(path).once("value")).val();
  },
});

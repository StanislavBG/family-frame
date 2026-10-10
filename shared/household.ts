import { z } from "zod";

// Exact household address. Private: never exposed through household connections.
export const householdAddressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    region: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().trim().min(1).max(100),
    timezone: z
      .string()
      .max(64)
      .regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/)
      .optional(),
  })
  .strict();

export type HouseholdAddress = z.infer<typeof householdAddressSchema>;

export function isAddressComplete(addr: HouseholdAddress | undefined | null): boolean {
  if (!addr) return false;
  return [addr.line1, addr.city, addr.country].every(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
}

export const EVENTS_SHARING_CONSENT_VERSION = 1;

export const EVENTS_SHARING_CONSENT_TEXT =
  "Share our home address with the Family Frame events service so it can find local events for our household. The service runs on the Family Frame operator's own computer. It receives our address, our household members' ages (not names or birthdays), our event preferences and our event feedback. Our exact address is only used to work out distances; AI web searches only see our city and area. Turning this off stops new recommendations right away, and the service deletes our household from its own records on its next run.";

export const eventsSharingSchema = z.object({
  enabled: z.boolean(),
  consentVersion: z.number().int().positive().optional(),
  consentedAt: z.string().optional(),
  revokedAt: z.string().optional(),
});

export type EventsSharing = z.infer<typeof eventsSharingSchema>;

export const consentLogEntrySchema = z.object({
  at: z.string(),
  action: z.enum(["granted", "revoked"]),
  consentVersion: z.number().int().positive(),
});

export type ConsentLogEntry = z.infer<typeof consentLogEntrySchema>;

export const householdProfileSchema = z.object({
  address: householdAddressSchema.optional(),
  eventsSharing: eventsSharingSchema.default({ enabled: false }),
  updatedAt: z.string().optional(),
});

export type HouseholdProfile = z.infer<typeof householdProfileSchema>;

export const putEventsSharingSchema = z.object({ enabled: z.boolean() }).strict();

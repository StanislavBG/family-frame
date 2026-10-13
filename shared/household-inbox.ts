import { z } from "zod";

// Free "household email": one operator-owned Gmail inbox; each household forwards to
// <base-local>+<householdKey>[-<personSlug>]@<domain>. Pure and browser-safe (no node imports).

export const INBOX_KEY_PATTERN = /^[a-z0-9]{10}$/;

const KEY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 chars: no l, o, 0, 1
const KEY_LENGTH = 10;
const SLUG_MAX = 20;
const SLUG_PATTERN = /^[a-z0-9]{1,20}$/;

export function generateInboxKey(random: (n: number) => Uint8Array): string {
  const bytes = random(KEY_LENGTH);
  let key = "";
  for (let i = 0; i < KEY_LENGTH; i++) key += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  return key;
}

export function personSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, SLUG_MAX);
}

function splitAddress(address: string): { local: string; domain: string } | null {
  const trimmed = address.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1) };
}

function isGmailDomain(domain: string): boolean {
  return domain === "gmail.com" || domain === "googlemail.com";
}

export function buildInboxAddress(base: string, key: string, slug?: string): string {
  const parts = splitAddress(base);
  if (!parts) throw new Error("Invalid base address");
  const tag = slug ? `${key}-${slug}` : key;
  return `${parts.local}+${tag}@${parts.domain}`;
}

export function parseInboxTag(
  address: string,
  base: string,
): { key: string; personSlug?: string } | null {
  const addr = splitAddress(address);
  const baseParts = splitAddress(base);
  if (!addr || !baseParts) return null;
  if (addr.domain !== baseParts.domain) return null;

  const plus = addr.local.indexOf("+");
  if (plus < 0) return null;
  let local = addr.local.slice(0, plus);
  let baseLocal = baseParts.local.split("+")[0];
  if (isGmailDomain(baseParts.domain)) {
    local = local.replace(/\./g, "");
    baseLocal = baseLocal.replace(/\./g, "");
  }
  if (local !== baseLocal) return null;

  const tag = addr.local.slice(plus + 1);
  const dash = tag.indexOf("-");
  const key = dash < 0 ? tag : tag.slice(0, dash);
  if (!INBOX_KEY_PATTERN.test(key)) return null;
  if (dash < 0) return { key };
  const slug = tag.slice(dash + 1);
  if (!SLUG_PATTERN.test(slug)) return null;
  return { key, personSlug: slug };
}

const CONFIRM_HOSTS = new Set(["mail-settings.google.com", "mail.google.com"]);

export function isGmailConfirmUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    CONFIRM_HOSTS.has(parsed.hostname) &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

export const inboxSourceSchema = z.object({
  email: z.string().email(),
  status: z.enum(["pending", "approved", "blocked"]),
  firstSeenAt: z.string(),
  verifyUrl: z.string().optional(),
  verifyRequestedAt: z.string().optional(),
});

export type InboxSource = z.infer<typeof inboxSourceSchema>;

const deliverMessageSchema = z
  .object({
    id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
    receivedAt: z.string().datetime({ offset: true }),
    from: z
      .object({
        name: z.string().max(200).optional(),
        email: z.string().max(320),
      })
      .strict(),
    subject: z.string().max(1000),
    text: z.string().max(200_000),
  })
  .strict();

const deliverVerificationSchema = z
  .object({
    requester: z.string().email(),
    confirmUrl: z.string().max(2048).refine(isGmailConfirmUrl, "Not a Gmail confirmation URL"),
  })
  .strict();

export const deliverRequestSchema = z
  .object({
    key: z.string().regex(INBOX_KEY_PATTERN),
    personSlug: z.string().regex(SLUG_PATTERN).optional(),
    source: z.string().email().transform((s) => s.toLowerCase()),
    authenticated: z.boolean(),
    message: deliverMessageSchema.optional(),
    verification: deliverVerificationSchema.optional(),
  })
  .strict()
  .refine((v) => (v.message === undefined) !== (v.verification === undefined), {
    message: "Provide exactly one of message or verification",
  });

export type DeliverRequest = z.infer<typeof deliverRequestSchema>;

// "Organize forwarded mail": the structured result of reading one inbox email.
export const BILL_CATEGORIES = [
  "electricity",
  "gas",
  "water",
  "internet",
  "garbage",
  "phone",
  "insurance",
  "other",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockTime = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);

export const organizedBillSchema = z
  .object({
    vendor: z.string().trim().min(1).max(80),
    category: z.enum(BILL_CATEGORIES),
    amount: z.number().finite().min(0).max(1e6),
    currency: z.string().regex(/^[A-Z]{3}$/),
    billDate: isoDate,
    dueDate: isoDate.optional(),
  })
  .strict();

export const organizedDaySchema = z
  .object({
    personId: z.string().min(1).max(128),
    date: isoDate,
    title: z.string().trim().min(1).max(120),
    summary: z.string().max(2000).optional(),
    metrics: z
      .array(
        z
          .object({
            label: z.string().min(1).max(40),
            value: z.string().min(1).max(40),
            tone: z.enum(["neutral", "good", "warn", "info"]).optional(),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    highlights: z.array(z.object({ text: z.string().min(1).max(500) }).strict()).max(20).optional(),
    napSpans: z.array(z.object({ start: clockTime, end: clockTime }).strict()).max(6).optional(),
  })
  .strict();

export const organizedRequestSchema = z
  .object({
    mailId: z.string().startsWith("hh-").max(128),
    kind: z.enum(["bill", "daily-report", "other"]),
    bill: organizedBillSchema.optional(),
    day: organizedDaySchema.optional(),
  })
  .strict()
  .refine((v) => (v.kind === "bill") === (v.bill !== undefined), {
    message: "bill is required when kind is bill, and only then",
    path: ["bill"],
  })
  .refine((v) => (v.kind === "daily-report") === (v.day !== undefined), {
    message: "day is required when kind is daily-report, and only then",
    path: ["day"],
  });

export type OrganizedRequest = z.infer<typeof organizedRequestSchema>;

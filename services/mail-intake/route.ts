import { deliverRequestSchema, isGmailConfirmUrl, parseInboxTag, type DeliverRequest } from "../../shared/household-inbox";
import type { GmailMessage } from "./gmail";

export type RouteResult = { kind: "deliver"; body: DeliverRequest } | { kind: "skip"; reason: string };

const CONFIRM_SENDER = "forwarding-noreply@google.com";
const SUBJECT_MAX = 1000;
const NAME_MAX = 200;
const EMAIL_MAX = 320;

function header(msg: GmailMessage, name: string): string | undefined {
  return msg.headers.get(name)?.[0];
}

function parseFrom(value: string): { name?: string; email: string } {
  const angle = /<([^<>]*)>/.exec(value);
  if (angle) {
    const name = value.slice(0, angle.index).trim().replace(/^["']+|["']+$/g, "").trim();
    return { ...(name ? { name: name.slice(0, NAME_MAX) } : {}), email: angle[1].trim().slice(0, EMAIL_MAX) };
  }
  return { email: value.trim().replace(/^["'<]+|["'>]+$/g, "").slice(0, EMAIL_MAX) };
}

function addressDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0 ? address.toLowerCase() : address.slice(at + 1).toLowerCase();
}

function findTag(msg: GmailMessage, base: string): { key: string; personSlug?: string } | null {
  for (const value of msg.headers.get("delivered-to") ?? []) {
    const tag = parseInboxTag(value.trim(), base);
    if (tag) return tag;
  }
  return null;
}

function isAuthenticated(msg: GmailMessage, sourceDomain: string): boolean {
  for (const result of msg.headers.get("authentication-results") ?? []) {
    for (const segment of result.split(";")) {
      if (!/\b(dkim|spf)=pass\b/i.test(segment)) continue;
      const re = /\b(?:header\.i|header\.d|smtp\.mailfrom)=([^\s;]+)/gi;
      for (let m = re.exec(segment); m; m = re.exec(segment)) {
        const domain = addressDomain(m[1].replace(/^["'<]+|["'>)]+$/g, ""));
        if (domain === sourceDomain) return true;
      }
    }
  }
  return false;
}

function parseVerification(subject: string, text: string): { requester: string; confirmUrl: string } | null {
  const email = "([^\\s<>\"'(),;:]+@[^\\s<>\"'(),;:]*[^\\s<>\"'(),;:.])";
  const requesterMatch =
    new RegExp(`Receive Mail from\\s+${email}`, "i").exec(subject) ??
    new RegExp(`Receive Mail from\\s+${email}`, "i").exec(text) ??
    new RegExp(`${email}\\s+has requested to automatically forward mail to`, "i").exec(text);
  if (!requesterMatch) return null;
  const urls = text.match(/https:\/\/[^\s<>"')\]]+/g) ?? [];
  const confirmUrl = urls.map((u) => u.replace(/[.,;]+$/, "")).find(isGmailConfirmUrl);
  if (!confirmUrl) return null;
  return { requester: requesterMatch[1], confirmUrl };
}

export function routeMessage(msg: GmailMessage, base: string): RouteResult {
  const tag = findTag(msg, base);
  if (!tag) return { kind: "skip", reason: "no-household-tag" };

  const from = parseFrom(header(msg, "from") ?? "");
  const subject = (header(msg, "subject") ?? "").slice(0, SUBJECT_MAX);
  const forwardedFor = header(msg, "x-forwarded-for")?.trim().split(/\s+/)[0];
  const source = (forwardedFor || from.email).toLowerCase();
  const authenticated = isAuthenticated(msg, addressDomain(source));

  const common = {
    key: tag.key,
    ...(tag.personSlug ? { personSlug: tag.personSlug } : {}),
    source,
    authenticated,
  };

  let candidate: unknown;
  if (from.email.toLowerCase() === CONFIRM_SENDER) {
    const verification = parseVerification(subject, msg.text);
    if (!verification) return { kind: "skip", reason: "bad-confirmation" };
    candidate = { ...common, verification };
  } else {
    candidate = {
      ...common,
      message: { id: msg.id, receivedAt: msg.internalDate, from, subject, text: msg.text },
    };
  }

  const parsed = deliverRequestSchema.safeParse(candidate);
  if (!parsed.success) return { kind: "skip", reason: "invalid-message" };
  return { kind: "deliver", body: parsed.data };
}

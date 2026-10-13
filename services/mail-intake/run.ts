import type { GmailClient } from "./gmail";
import type { InboxFfClient } from "./ff-inbox-client";
import type { MeteredHaikuRunner } from "../events-pipeline/haiku";
import { organizeMessage } from "./organize";
import { routeMessage } from "./route";

export const INTAKE_QUERY = "in:anywhere -label:ff-routed -label:ff-failed newer_than:30d";
export const ROUTED_LABEL = "ff-routed";
export const FAILED_LABEL = "ff-failed";
const DEFAULT_MAX = 50;
const DEFAULT_MAX_ORGANIZE = 20;

export interface RunSummary {
  seen: number;
  delivered: number;
  held: number;
  verification: number;
  unknown: number;
  skipped: number;
  failed: number;
  organized: number;
  organizeFailed: number;
  stoppedEarly: boolean;
}

export interface RunDeps {
  gmail: GmailClient;
  ff: InboxFfClient;
  base: string;
  log: (line: string) => void;
  max?: number;
  organize?: { runner: Pick<MeteredHaikuRunner, "run">; maxPerRun?: number };
}

function resultStatus(result: unknown): string | undefined {
  if (result && typeof result === "object" && "status" in result) {
    const s = (result as { status: unknown }).status;
    return typeof s === "string" ? s : undefined;
  }
  return undefined;
}

interface OrganizeTarget {
  householdId: string;
  mailId: string;
  personId?: string;
}

function organizeTarget(result: unknown): OrganizeTarget | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  if (r.organize !== true || typeof r.householdId !== "string" || typeof r.mailId !== "string") return undefined;
  return {
    householdId: r.householdId,
    mailId: r.mailId,
    ...(typeof r.personId === "string" ? { personId: r.personId } : {}),
  };
}

/** Never throws: organize problems are logged and counted, delivery is already done. */
async function organizeOne(
  runner: Pick<MeteredHaikuRunner, "run">,
  target: OrganizeTarget,
  message: { receivedAt: string; from: { email: string }; subject: string; text: string },
  summary: RunSummary,
  ff: InboxFfClient,
  log: (line: string) => void,
  gmailId: string,
): Promise<void> {
  try {
    const organized = await organizeMessage(runner, {
      mailId: target.mailId,
      subject: message.subject,
      fromEmail: message.from.email,
      receivedAt: message.receivedAt,
      text: message.text,
      personId: target.personId,
    });
    if (!organized) {
      summary.organizeFailed++;
      log(`organize produced no result for message ${gmailId}`);
      return;
    }
    const res = await ff.organized(target.householdId, organized);
    if (res.ok) {
      summary.organized++;
    } else {
      summary.organizeFailed++;
      log(`organized post for message ${gmailId} failed (${res.status}): ${res.error}`);
    }
  } catch (e) {
    summary.organizeFailed++;
    log(`organize failed for message ${gmailId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** GmailAuthError and other Gmail errors propagate to the caller. */
export async function runOnce(deps: RunDeps): Promise<RunSummary> {
  const { gmail, ff, base, log } = deps;
  const summary: RunSummary = {
    seen: 0,
    delivered: 0,
    held: 0,
    verification: 0,
    unknown: 0,
    skipped: 0,
    failed: 0,
    organized: 0,
    organizeFailed: 0,
    stoppedEarly: false,
  };
  let organizeCalls = 0;
  const maxOrganize = deps.organize?.maxPerRun ?? DEFAULT_MAX_ORGANIZE;
  const ids = await gmail.listMessageIds(INTAKE_QUERY, deps.max ?? DEFAULT_MAX);
  if (ids.length === 0) return summary;
  const routed = await gmail.ensureLabel(ROUTED_LABEL);
  const failed = await gmail.ensureLabel(FAILED_LABEL);

  for (const id of ids) {
    summary.seen++;
    const msg = await gmail.getMessage(id);
    const route = routeMessage(msg, base);
    if (route.kind === "skip") {
      summary.skipped++;
      await gmail.addLabels(id, [routed]);
      continue;
    }
    const res = await ff.deliver(route.body);
    if (res.ok) {
      switch (resultStatus(res.result)) {
        case "delivered":
          summary.delivered++;
          if (deps.organize && organizeCalls < maxOrganize && route.body.message) {
            const target = organizeTarget(res.result);
            if (target) {
              organizeCalls++;
              await organizeOne(deps.organize.runner, target, route.body.message, summary, ff, log, id);
            }
          }
          break;
        case "held":
          summary.held++;
          break;
        case "verification":
          summary.verification++;
          break;
        case "unknown":
          summary.unknown++;
          break;
        default:
          summary.skipped++;
      }
      await gmail.addLabels(id, [routed]);
    } else if (res.status >= 400 && res.status < 500) {
      summary.failed++;
      log(`message ${id} rejected by Family Frame (${res.status}): ${res.error}`);
      await gmail.addLabels(id, [failed]);
    } else {
      summary.stoppedEarly = true;
      log(`stopping run at message ${id}: ${res.error}`);
      break;
    }
  }
  return summary;
}

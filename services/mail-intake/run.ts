import type { GmailClient } from "./gmail";
import type { InboxFfClient } from "./ff-inbox-client";
import { routeMessage } from "./route";

export const INTAKE_QUERY = "in:anywhere -label:ff-routed -label:ff-failed newer_than:30d";
export const ROUTED_LABEL = "ff-routed";
export const FAILED_LABEL = "ff-failed";
const DEFAULT_MAX = 50;

export interface RunSummary {
  seen: number;
  delivered: number;
  held: number;
  verification: number;
  unknown: number;
  skipped: number;
  failed: number;
  stoppedEarly: boolean;
}

export interface RunDeps {
  gmail: GmailClient;
  ff: InboxFfClient;
  base: string;
  log: (line: string) => void;
  max?: number;
}

function resultStatus(result: unknown): string | undefined {
  if (result && typeof result === "object" && "status" in result) {
    const s = (result as { status: unknown }).status;
    return typeof s === "string" ? s : undefined;
  }
  return undefined;
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
    stoppedEarly: false,
  };
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

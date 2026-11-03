import type { FfEvent } from "../../shared/events";
import { classifySource, sourceKindFor } from "../../shared/events-sources";

const KIND_RANK: Record<string, number> = { official: 0, listing: 2 };

/**
 * Pure source policy: re-classify sources against the organizer, order them
 * official first, then other, then listing (stable), and drop listing-domain
 * sign-up and ticket links. Nothing else changes.
 */
export function applySourcePolicy(event: FfEvent): FfEvent {
  const orgUrl = event.organizer?.url;
  const sources = event.sources
    .map((s) => {
      if (s.kind === "social" || s.kind === "news") return s;
      return { ...s, kind: sourceKindFor(classifySource(s.url, orgUrl)) };
    })
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (KIND_RANK[a.s.kind] ?? 1) - (KIND_RANK[b.s.kind] ?? 1) || a.i - b.i)
    .map((x) => x.s);

  const cost = { ...event.cost };
  if (cost.registrationUrl && classifySource(cost.registrationUrl, orgUrl) === "listing") delete cost.registrationUrl;
  if (cost.ticketUrl && classifySource(cost.ticketUrl, orgUrl) === "listing") delete cost.ticketUrl;
  return { ...event, sources, cost };
}

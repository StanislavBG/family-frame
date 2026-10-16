import type { FfEvent } from "@shared/events";
import { formatCost, formatWhen, type EventItem } from "@/lib/events";

export interface EventFact {
  label: string;
  value: string;
}

const AGE_LABELS: Record<FfEvent["audience"]["ageBands"][number], string> = {
  baby: "Babies",
  toddler: "Toddlers",
  preschool: "Preschool",
  "school-age": "School age",
  teen: "Teens",
  adult: "Adults",
  senior: "Seniors",
  "all-ages": "All ages",
};

const SETTING_LABELS: Record<FfEvent["location"]["setting"], string | null> = {
  indoor: "Indoors",
  outdoor: "Outdoors",
  mixed: "Indoors and outdoors",
  unknown: null,
};

/** "12.3 km away · 18 min", or null when the recommendation has neither. */
export function distanceText(rec: Pick<EventItem["rec"], "distanceKm" | "travelMinutes">): string | null {
  const { distanceKm, travelMinutes } = rec;
  const parts: string[] = [];
  if (distanceKm !== undefined) parts.push(`${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km away`);
  if (travelMinutes !== undefined) parts.push(`${travelMinutes} min`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function wherePlace(location: FfEvent["location"]): string {
  return [location.venueName, location.address || [location.city, location.region].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
}

/** Venue · address (or city), falling back to "Online event" / "See map". */
export function whereSummary(location: FfEvent["location"]): string {
  return wherePlace(location) || (location.online ? "Online event" : "See map");
}

function ageText(audience: FfEvent["audience"]): string {
  return [
    audience.ageBands.map((b) => AGE_LABELS[b]).join(", "),
    audience.ageMin !== undefined || audience.ageMax !== undefined
      ? `ages ${audience.ageMin ?? 0}${audience.ageMax !== undefined ? `–${audience.ageMax}` : "+"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The compact "Details" rows, in display order, only those that apply. */
export function buildEventFacts(event: FfEvent, rec: Pick<EventItem["rec"], "distanceKm" | "travelMinutes">): EventFact[] {
  const { location, cost, audience, organizer } = event;
  const facts: EventFact[] = [{ label: "When", value: formatWhen(event.schedule) }];

  const where = wherePlace(location) || (location.online ? "Online event" : "");
  if (where) facts.push({ label: "Where", value: where });

  const distance = distanceText(rec);
  if (distance) facts.push({ label: "Distance", value: distance });

  const costText = formatCost(cost);
  facts.push({
    label: "Cost",
    value: cost.priceText && !cost.isFree && cost.priceText !== costText ? `${costText} · ${cost.priceText}` : costText,
  });

  const tickets = [cost.ticketRequired && "Ticket required", cost.registrationRequired && "Registration required"].filter(
    (t): t is string => !!t,
  );
  if (tickets.length > 0) facts.push({ label: "Tickets", value: tickets.join(" · ") });

  const ages = ageText(audience);
  if (ages) facts.push({ label: "Ages", value: ages });
  const setting = SETTING_LABELS[location.setting];
  if (setting) facts.push({ label: "Setting", value: setting });
  if (audience.strollerFriendly) facts.push({ label: "Strollers", value: "Stroller friendly" });
  if (location.accessibilityNotes) facts.push({ label: "Accessibility", value: location.accessibilityNotes });
  if (location.parkingNotes) facts.push({ label: "Parking", value: location.parkingNotes });
  if (organizer) {
    facts.push({ label: "Organizer", value: [organizer.name, organizer.contact].filter(Boolean).join(" · ") });
  }
  return facts;
}

function hasCoordinates(location: FfEvent["location"]): boolean {
  return typeof location.lat === "number" && typeof location.lon === "number";
}

/** True when the event has a place a map can find (not online-only). */
export function hasMapLocation(location: FfEvent["location"]): boolean {
  const { venueName, address, city, region, postalCode } = location;
  return [venueName, address, city, region, postalCode].some(Boolean) || hasCoordinates(location);
}

/** Google Maps search link for the place text, or its coordinates when there is no text. */
export function mapUrl(location: FfEvent["location"]): string {
  const text = [location.venueName, location.address, location.city, location.region, location.postalCode, location.country]
    .filter(Boolean)
    .join(", ");
  const query = text || (hasCoordinates(location) ? `${location.lat},${location.lon}` : "");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

import type { EventCategory, EventPreferences, FfEvent } from "../../shared/events";
import type { PreferenceSummary } from "../../shared/events-preferences";

// Pure scorer: picks which repository events to recommend to one household.
// No DB, no network, no clock (uses input.now).

export interface BusyInterval {
  start: string;
  end: string;
  /** Block covers whole calendar dates (start/end are dates or date-times). */
  allDay?: boolean;
  /** An all-day block only clashes with timed events when flagged busy-all-day. */
  busyAllDay?: boolean;
}

export interface RankLimits {
  focusDays?: number;
  horizonDays?: number;
  maxFocus?: number;
  maxLater?: number;
}

export interface RankInput {
  events: FfEvent[];
  household: {
    lat?: number;
    lon?: number;
    memberAges: number[];
    preferences: EventPreferences;
    learned: PreferenceSummary;
  };
  state: { knownEventIds: string[]; knownFingerprints: string[]; busy: BusyInterval[] };
  now: Date;
  limits?: RankLimits;
}

export interface RankPick {
  event: FfEvent;
  score: number;
  distanceKm?: number;
  matchReasons: string[];
}

export interface RankResult {
  picks: RankPick[];
  skipped: { eventId: string; reason: string }[];
}

const MS_PER_DAY = 86_400_000;
const DEFAULT_DURATION_MS = 2 * 3_600_000;
const MAX_PER_CATEGORY = 3;
const CHILD_MAX_AGE = 17;
const FOCUS_BONUS = 0.1;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const unit = (w: number): number => clamp01((w + 1) / 2);

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Slot {
  start: string;
  startMs: number;
  endMs: number;
}

/** The occurrence that matters now: first one not yet over, else the main schedule. */
function pickSlot(event: FfEvent, nowMs: number): Slot {
  const { schedule } = event;
  const candidates = [{ start: schedule.start, end: schedule.end }, ...schedule.occurrences];
  const slots = candidates
    .map((c) => {
      const startMs = Date.parse(c.start);
      const endMs = c.end ? Date.parse(c.end) : startMs + DEFAULT_DURATION_MS;
      return { start: c.start, startMs, endMs };
    })
    .sort((a, b) => a.startMs - b.startMs);
  const upcoming = slots.find((s) => s.endMs >= nowMs);
  if (upcoming) return upcoming;
  return slots[slots.length - 1];
}

function localDate(iso: string): string {
  return iso.slice(0, 10);
}

function localHour(iso: string): number | undefined {
  const m = /T(\d{2}):/.exec(iso);
  return m ? Number(m[1]) : undefined;
}

function weekdayOf(iso: string): number {
  return new Date(`${localDate(iso)}T00:00:00Z`).getUTCDay();
}

function clashes(event: FfEvent, slot: Slot, busy: BusyInterval[]): boolean {
  const allDayEvent = event.schedule.allDay;
  const evStart = localDate(slot.start);
  for (const b of busy) {
    if (b.allDay) {
      if (!b.busyAllDay) continue;
      const bs = localDate(b.start);
      let be = localDate(b.end);
      // A date-only end after the start is exclusive (iCal style).
      if (b.end.length === 10 && be > bs) {
        be = new Date(Date.parse(`${be}T00:00:00Z`) - MS_PER_DAY).toISOString().slice(0, 10);
      }
      if (evStart >= bs && evStart <= be) return true;
      continue;
    }
    if (allDayEvent) continue;
    const bStart = Date.parse(b.start);
    const bEnd = Date.parse(b.end);
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;
    if (slot.startMs < bEnd && bStart < slot.endMs) return true;
  }
  return false;
}

function isPaid(event: FfEvent): boolean {
  return !event.cost.isFree;
}

function priceFit(event: FfEvent, prefs: EventPreferences, freePref: number): number {
  if (event.cost.isFree) return clamp01(0.8 + 0.2 * freePref);
  const min = event.cost.minPrice;
  if (prefs.budget === "low") return min !== undefined && min <= 20 ? 0.7 : 0.3;
  return clamp01(0.6 - 0.3 * freePref);
}

function ageFit(event: FfEvent, ages: number[]): number {
  if (ages.length === 0) return 0.5;
  const { audience } = event;
  if (audience.ageBands.includes("all-ages")) return 1;
  const lo = audience.ageMin ?? 0;
  const hi = audience.ageMax ?? 120;
  return ages.filter((a) => a >= lo && a <= hi).length / ages.length;
}

function dayTimeFit(
  slot: Slot,
  allDay: boolean,
  prefs: EventPreferences,
  learned: PreferenceSummary,
): { fit: number; dayMatch: boolean; timeMatch: boolean } {
  const parts: number[] = [];
  const wd = weekdayOf(slot.start);
  const weekend = wd === 0 || wd === 6;
  let dayMatch = false;
  let timeMatch = false;
  if (prefs.preferredDays.length > 0) {
    dayMatch = prefs.preferredDays.includes(weekend ? "weekend" : "weekday");
    parts.push(dayMatch ? 1 : 0.2);
  }
  if (learned.preferredWeekdays.length > 0) {
    parts.push(learned.preferredWeekdays.includes(wd) ? 1 : 0.3);
  }
  const hour = localHour(slot.start);
  if (!allDay && hour !== undefined && prefs.preferredTimes.length > 0) {
    const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    timeMatch = prefs.preferredTimes.includes(part);
    parts.push(timeMatch ? 1 : 0.3);
  }
  const fit = parts.length === 0 ? 0.5 : parts.reduce((a, b) => a + b, 0) / parts.length;
  return { fit, dayMatch, timeMatch };
}

interface Scored {
  pick: RankPick;
  focus: boolean;
}

export function rankForHousehold(input: RankInput): RankResult {
  const { events, household, state, now } = input;
  const focusDays = input.limits?.focusDays ?? 14;
  const horizonDays = input.limits?.horizonDays ?? 90;
  const maxFocus = input.limits?.maxFocus ?? 8;
  const maxLater = input.limits?.maxLater ?? 12;
  const { preferences: prefs, learned, memberAges } = household;
  const nowMs = now.getTime();
  const knownIds = new Set(state.knownEventIds);
  const knownFps = new Set(state.knownFingerprints);
  const oldest = memberAges.length > 0 ? Math.max(...memberAges) : undefined;
  const children = memberAges.filter((a) => a <= CHILD_MAX_AGE);
  const youngestChild = children.length > 0 ? Math.min(...children) : undefined;
  const haveHome = household.lat !== undefined && household.lon !== undefined;

  const skipped: RankResult["skipped"] = [];
  const scored: Scored[] = [];

  for (const event of events) {
    const skip = (reason: string): void => {
      skipped.push({ eventId: event.id, reason });
    };
    if (knownIds.has(event.id) || knownFps.has(event.fingerprint)) {
      skip("already known to household");
      continue;
    }
    if (event.status === "cancelled" || event.status === "ended") {
      skip(`status ${event.status}`);
      continue;
    }
    const slot = pickSlot(event, nowMs);
    if (Number.isNaN(slot.startMs) || slot.endMs < nowMs) {
      skip("already over");
      continue;
    }
    if (slot.startMs > nowMs + horizonDays * MS_PER_DAY) {
      skip("outside horizon");
      continue;
    }
    let distanceKm: number | undefined;
    const { lat, lon } = event.location;
    if (haveHome && lat !== undefined && lon !== undefined) {
      distanceKm = haversineKm(household.lat as number, household.lon as number, lat, lon);
      if (distanceKm > prefs.maxDistanceKm) {
        skip("beyond max distance");
        continue;
      }
    }
    if (prefs.avoidedCategories.includes(event.category)) {
      skip("avoided category");
      continue;
    }
    if (prefs.budget === "free" && isPaid(event)) {
      skip("paid event, budget is free");
      continue;
    }
    const { ageMin, ageMax } = event.audience;
    if (oldest !== undefined && ageMin !== undefined && ageMin > oldest) {
      skip("too old-skewing for household");
      continue;
    }
    if (youngestChild !== undefined && ageMax !== undefined && ageMax < youngestChild) {
      skip("too young-skewing for children");
      continue;
    }
    if (clashes(event, slot, state.busy)) {
      skip("clashes with calendar");
      continue;
    }

    const reasons: string[] = [];
    // Category
    const catW = learned.categoryWeights[event.category as EventCategory] ?? 0;
    const liked = prefs.likedCategories.includes(event.category);
    const catScore = clamp01(unit(catW) + (liked ? 0.2 : 0));
    if (liked) reasons.push("In a category you said you like");
    else if (catW >= 0.2) reasons.push("Similar to events you've enjoyed");
    // Tags
    const tagWs = event.tags.map((t) => learned.tagWeights[t.toLowerCase()] ?? learned.tagWeights[t]).filter(
      (w): w is number => typeof w === "number",
    );
    const tagScore = tagWs.length > 0 ? unit(tagWs.reduce((a, b) => a + b, 0) / tagWs.length) : 0.5;
    if (tagWs.length > 0 && tagScore > 0.6) reasons.push("Matches topics you've liked before");
    // Distance
    let distScore = 0.5;
    if (distanceKm !== undefined) {
      distScore = clamp01(1 - distanceKm / prefs.maxDistanceKm);
      reasons.push(`About ${Math.round(distanceKm)} km from home`);
    } else if (event.location.online) {
      distScore = 0.7;
    }
    // Price
    const price = priceFit(event, prefs, learned.freePreference);
    if (event.cost.isFree) reasons.push("Free to attend");
    else if (prefs.budget === "low" && price >= 0.7) reasons.push("Fits a modest budget");
    // Age
    const age = ageFit(event, memberAges);
    if (memberAges.length > 0 && age >= 0.99 && children.length > 0) reasons.push("Suits everyone's ages, including the kids");
    else if (memberAges.length > 0 && age >= 0.99) reasons.push("Suits everyone's ages");
    // Day/time
    const dt = dayTimeFit(slot, event.schedule.allDay, prefs, learned);
    if (dt.dayMatch) reasons.push("Falls on a day you prefer");
    if (dt.timeMatch) reasons.push("At a time of day you prefer");

    const daysAway = (slot.startMs - nowMs) / MS_PER_DAY;
    const focus = daysAway <= focusDays;
    const base = clamp01(
      0.35 * catScore + 0.15 * tagScore + 0.2 * distScore + 0.1 * price + 0.1 * age + 0.1 * dt.fit,
    );
    const score = base + (focus ? FOCUS_BONUS : 0);
    if (focus) reasons.push("Happening in the next two weeks");
    if (reasons.length === 0) reasons.push("A good all-round fit for your household");

    scored.push({
      focus,
      pick: { event, score, distanceKm, matchReasons: reasons.slice(0, 5) },
    });
  }

  scored.sort((a, b) => b.pick.score - a.pick.score || a.pick.event.id.localeCompare(b.pick.event.id));

  const picks: RankPick[] = [];
  const pickedFps = new Set<string>();
  const counts = { focus: 0, later: 0 };
  const perCategory = new Map<string, number>();
  for (const { pick, focus } of scored) {
    const { event } = pick;
    const window = focus ? "focus" : "later";
    if (pickedFps.has(event.fingerprint)) {
      skipped.push({ eventId: event.id, reason: "duplicate of a higher-ranked pick" });
      continue;
    }
    if (counts[window] >= (focus ? maxFocus : maxLater)) {
      skipped.push({ eventId: event.id, reason: `${window} window full` });
      continue;
    }
    const catKey = `${window}:${event.category}`;
    if ((perCategory.get(catKey) ?? 0) >= MAX_PER_CATEGORY) {
      skipped.push({ eventId: event.id, reason: "category variety cap" });
      continue;
    }
    perCategory.set(catKey, (perCategory.get(catKey) ?? 0) + 1);
    counts[window] += 1;
    pickedFps.add(event.fingerprint);
    picks.push(pick);
  }
  return { picks, skipped };
}

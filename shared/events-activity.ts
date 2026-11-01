/**
 * Activity helpers for Events: is it a class, does it need sign-up, where to
 * sign up, and which ages it suits. Pure module, runs in the browser and in the
 * local pipeline. Uses only existing event fields (ffEventSchema is strict).
 */
import type { AgeBand, FfEvent } from "./events";
import { dayWindows } from "./events-visit";

export const CLASS_TAG = "class";

const CLASS_WORDS = /\b(class(es)?|lessons?|courses?|workshops?|camps?|clinics?)\b/i;

export function isClassTitle(title: string): boolean {
  return CLASS_WORDS.test(title ?? "");
}

export function isClassOrLesson(event: Pick<FfEvent, "title" | "tags">): boolean {
  const tags = event.tags ?? [];
  if (tags.some((t) => t.trim().toLowerCase() === CLASS_TAG)) return true;
  return isClassTitle(event.title) || tags.some((t) => isClassTitle(t));
}

export function needsSignUp(event: Pick<FfEvent, "cost">): boolean {
  return !!event.cost?.registrationRequired || !!event.cost?.registrationUrl;
}

export function isSignUpActivity(event: Pick<FfEvent, "title" | "tags" | "cost">): boolean {
  return isClassOrLesson(event) || needsSignUp(event);
}

export function signUpUrl(
  event: Pick<FfEvent, "cost" | "organizer" | "sources">,
): string | undefined {
  if (event.cost?.registrationUrl) return event.cost.registrationUrl;
  if (!needsSignUp(event)) return undefined;
  return event.organizer?.url ?? event.sources?.[0]?.url ?? undefined;
}

/** A class with no dated session: it runs on an ongoing basis. */
export function isOngoingClass(event: Pick<FfEvent, "title" | "tags" | "schedule">): boolean {
  if (!isClassOrLesson(event)) return false;
  return !dayWindows(event as FfEvent).some((w) => w.kind === "session");
}

export type AudienceGroup = "kids" | "adults" | "everyone";
type Audience = Pick<FfEvent["audience"], "ageBands" | "ageMin" | "ageMax">;

const KID_BANDS: AgeBand[] = ["baby", "toddler", "preschool", "school-age", "teen"];
const ADULT_BANDS: AgeBand[] = ["adult", "senior"];
const ADULT_TITLE = /\b(adults?|seniors?)\b/i;

const CHILD_ONLY_BANDS: AgeBand[] = ["baby", "toddler", "preschool", "school-age"];

function childrenOnly(bands: AgeBand[] | undefined): boolean {
  return !!bands && bands.length > 0 && bands.every((b) => CHILD_ONLY_BANDS.includes(b));
}

/**
 * Ages in years. Searches sometimes return months for children's classes
 * (band toddler, ages 24-36). When every band is a child band and the numbers
 * cannot be years (max > 17 or min >= 13), convert; otherwise unchanged.
 */
export function agesInYears(audience: Audience): { ageMin?: number; ageMax?: number } {
  const { ageBands, ageMin, ageMax } = audience;
  const out: { ageMin?: number; ageMax?: number } = {};
  const months =
    childrenOnly(ageBands) &&
    ((ageMax !== undefined && ageMax > 17) || (ageMin !== undefined && ageMin >= 13));
  if (ageMin !== undefined) out.ageMin = months ? Math.floor(ageMin / 12) : ageMin;
  if (ageMax !== undefined) out.ageMax = months ? Math.ceil(ageMax / 12) : ageMax;
  return out;
}

export function audienceGroup(event: Pick<FfEvent, "title" | "audience">): AudienceGroup {
  const { ageBands } = event.audience;
  const { ageMin, ageMax } = agesInYears(event.audience);
  const bands = ageBands ?? [];
  if (bands.includes("all-ages") && ageMin === undefined && ageMax === undefined) {
    return ADULT_TITLE.test(event.title ?? "") ? "adults" : "everyone";
  }
  if (ageMin !== undefined && ageMin >= 16 && !childrenOnly(bands)) return "adults";
  const kid = bands.some((b) => KID_BANDS.includes(b));
  const adult = bands.some((b) => ADULT_BANDS.includes(b));
  if (kid && adult) return "everyone";
  if (adult) return "adults";
  return "kids";
}

const BAND_RANGES: Record<AgeBand, [number, number]> = {
  baby: [0, 0],
  toddler: [1, 2],
  preschool: [3, 5],
  "school-age": [6, 12],
  teen: [13, 17],
  adult: [18, 120],
  senior: [65, 120],
  "all-ages": [0, 120],
};

export function suitsAge(audience: Audience, age: number): boolean {
  const { ageMin, ageMax } = agesInYears(audience);
  if (ageMin !== undefined || ageMax !== undefined) {
    return (ageMin === undefined || age >= ageMin) && (ageMax === undefined || age <= ageMax);
  }
  return (audience.ageBands ?? []).some((b) => age >= BAND_RANGES[b][0] && age <= BAND_RANGES[b][1]);
}

/** Empty ages = true. Children (< 18) must all fit; if any child is picked adults come along. */
export function suitsPeople(audience: Audience, ages: number[]): boolean {
  if (ages.length === 0) return true;
  const children = ages.filter((a) => a < 18);
  if (children.length > 0) return children.every((a) => suitsAge(audience, a));
  return ages.every((a) => suitsAge(audience, a));
}

/** Whole years on todayIso, or null for a missing/malformed date or a future birthday. */
export function ageOn(birthday: string | undefined, todayIso: string): number | null {
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayIso ?? "");
  const m = typeof birthday === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday) : null;
  if (!t || !m) return null;
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])];
  const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age >= 0 ? age : null;
}

import { EVENT_CATEGORIES } from "./events";
import type { EventCategory, EventPreferences, FeedbackEntry } from "./events";

// Pure aggregation of a household's append-only feedback log plus its stated
// preferences into weights the pipeline uses to steer searches and ranking,
// and a short human summary the Events app shows as "what we've learned".

export interface PreferenceSummary {
  categoryWeights: Record<EventCategory, number>;
  tagWeights: Record<string, number>;
  freePreference: number;
  maxDistanceKm: number;
  preferredWeekdays: number[];
  signalsCount: number;
  lines: string[];
}

export const HALF_LIFE_DAYS = 120;
const MAX_TAGS = 30;
const MAX_LINES = 6;
const MS_PER_DAY = 86_400_000;
const STATED_LIKE_BONUS = 0.6;
const LINE_THRESHOLD = 0.2;
const TAG_WEIGHT_FACTOR = 0.5;

export const SIGNAL_WEIGHTS: Record<string, number> = {
  liked: 1,
  disliked: -1,
  "more-like-this": 1.5,
  "less-like-this": -1.5,
  relevant: 0.5,
  "not-relevant": -0.75,
  "response:going": 1,
  "response:interested": 0.5,
  "response:not-interested": -0.75,
  "response:dismissed": -0.25,
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  "parks-outdoors": "parks & outdoors",
  "nature-animals": "nature & animals",
  "kids-activities": "kids' activities",
  "baby-toddler": "baby & toddler events",
  "sports-fitness": "sports & fitness",
  "arts-culture": "arts & culture",
  "music-performance": "music & performances",
  "museums-learning": "museums & learning",
  "festivals-fairs": "festivals & fairs",
  "faith-church": "faith & church",
  "food-markets": "food & markets",
  "community-volunteering": "community & volunteering",
  "holiday-seasonal": "holiday & seasonal",
  "family-entertainment": "family entertainment",
  other: "other events",
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const normalize = (sum: number): number => Math.max(-1, Math.min(1, Math.tanh(sum / 3)));

export function aggregatePreferences(
  feedback: FeedbackEntry[],
  stated: EventPreferences,
  opts: { now?: Date } = {},
): PreferenceSummary {
  const nowMs = (opts.now ?? new Date()).getTime();
  const categorySums = new Map<EventCategory, number>();
  const tagSums = new Map<string, number>();
  const weekdaySums = new Array<number>(7).fill(0);
  let freeNumerator = 0;
  let freeDenominator = 0;
  let signalsCount = 0;

  for (const entry of feedback) {
    const base = SIGNAL_WEIGHTS[entry.signal];
    if (base === undefined) continue;
    const atMs = Date.parse(entry.at);
    if (Number.isNaN(atMs)) continue;
    const ageDays = Math.max(0, (nowMs - atMs) / MS_PER_DAY);
    const weight = base * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    signalsCount += 1;

    const { category, tags, weekday, isFree } = entry.snapshot;
    categorySums.set(category, (categorySums.get(category) ?? 0) + weight);
    for (const tag of tags) {
      tagSums.set(tag, (tagSums.get(tag) ?? 0) + weight * TAG_WEIGHT_FACTOR);
    }
    weekdaySums[weekday] += weight;
    if (weight > 0) {
      freeNumerator += isFree ? weight : -weight;
      freeDenominator += weight;
    }
  }

  const avoided = new Set(stated.avoidedCategories);
  const liked = new Set(stated.likedCategories);
  const categoryWeights = {} as Record<EventCategory, number>;
  for (const category of EVENT_CATEGORIES) {
    let value = normalize(categorySums.get(category) ?? 0);
    if (liked.has(category)) value = Math.min(1, value + STATED_LIKE_BONUS);
    if (avoided.has(category)) value = -1;
    categoryWeights[category] = value;
  }

  const tagWeights: Record<string, number> = {};
  Array.from(tagSums.entries())
    .map(([tag, sum]) => [tag, normalize(sum)] as const)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, MAX_TAGS)
    .forEach(([tag, value]) => {
      tagWeights[tag] = value;
    });

  const freePreference = freeDenominator > 0 ? Math.max(-1, Math.min(1, freeNumerator / freeDenominator)) : 0;
  const preferredWeekdays = weekdaySums.flatMap((sum, day) => (sum > 0 ? [day] : []));

  const lines = buildLines({
    categoryWeights,
    freePreference,
    maxDistanceKm: stated.maxDistanceKm,
    preferredWeekdays,
    signalsCount,
  });

  return {
    categoryWeights,
    tagWeights,
    freePreference,
    maxDistanceKm: stated.maxDistanceKm,
    preferredWeekdays,
    signalsCount,
    lines,
  };
}

function buildLines(s: {
  categoryWeights: Record<EventCategory, number>;
  freePreference: number;
  maxDistanceKm: number;
  preferredWeekdays: number[];
  signalsCount: number;
}): string[] {
  const ranked = EVENT_CATEGORIES.map((c) => [c, s.categoryWeights[c]] as const);
  const likes = ranked
    .filter(([, w]) => w >= LINE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => CATEGORY_LABELS[c]);
  const avoids = ranked
    .filter(([, w]) => w <= -LINE_THRESHOLD)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([c]) => CATEGORY_LABELS[c]);

  const lines: string[] = [];
  if (likes.length > 0) lines.push(`Likes: ${likes.join(", ")}`);
  if (avoids.length > 0) lines.push(`Avoids: ${avoids.join(", ")}`);
  if (s.freePreference >= LINE_THRESHOLD) lines.push("Prefers free events");
  else if (s.freePreference <= -LINE_THRESHOLD) lines.push("Happy to pay for events they enjoy");
  if (s.preferredWeekdays.length > 0) {
    lines.push(`Best days: ${s.preferredWeekdays.map((d) => WEEKDAY_NAMES[d]).join(", ")}`);
  }
  lines.push(`Searching within ${s.maxDistanceKm} km`);
  lines.push(
    s.signalsCount === 0
      ? "No feedback yet; rate events to teach us"
      : `Learned from ${s.signalsCount} ${s.signalsCount === 1 ? "reaction" : "reactions"}`,
  );
  return lines.slice(0, MAX_LINES);
}

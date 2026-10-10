import { z } from "zod";

// Single source of truth for the Events app and the local event pipeline:
// the canonical event JSON agents publish, the per-household recommendation
// wrapper, household responses, feedback and stated preferences.

export const EVENT_CATEGORIES = [
  "parks-outdoors",
  "nature-animals",
  "kids-activities",
  "baby-toddler",
  "sports-fitness",
  "arts-culture",
  "music-performance",
  "museums-learning",
  "festivals-fairs",
  "faith-church",
  "food-markets",
  "community-volunteering",
  "holiday-seasonal",
  "family-entertainment",
  "other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_STATUSES = [
  "scheduled",
  "tentative",
  "postponed",
  "rescheduled",
  "cancelled",
  "sold-out",
  "moved-online",
  "ended",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_UPDATE_KINDS = [
  "cancelled",
  "postponed",
  "rescheduled",
  "time-changed",
  "venue-changed",
  "price-changed",
  "sold-out",
  "announcement",
  "details-changed",
  "reinstated",
] as const;
export type EventUpdateKind = (typeof EVENT_UPDATE_KINDS)[number];

export const AGE_BANDS = [
  "baby",
  "toddler",
  "preschool",
  "school-age",
  "teen",
  "adult",
  "senior",
  "all-ages",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const HOUSEHOLD_RESPONSES = [
  "new",
  "interested",
  "going",
  "maybe",
  "not-interested",
  "dismissed",
] as const;
export type HouseholdResponse = (typeof HOUSEHOLD_RESPONSES)[number];

export const FEEDBACK_SIGNALS = [
  "relevant",
  "not-relevant",
  "liked",
  "disliked",
  "more-like-this",
  "less-like-this",
] as const;
export type FeedbackSignal = (typeof FEEDBACK_SIGNALS)[number];

export const EVENTS_LIMITS = {
  maxBatch: 50,
  maxSources: 10,
  maxUpdates: 50,
  maxOccurrences: 50,
  maxTags: 20,
  maxEventJsonBytes: 20000,
  maxActivePerHousehold: 400,
  maxFeedbackReason: 280,
} as const;

const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://"), "Must be an https URL");

const isoDateTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Must be an ISO date or date-time");

const visibilitySchema = z.enum(["Shared", "Private"]);
const languagesSchema = z.array(z.string().min(2).max(8)).max(10);

const occurrenceSchema = z
  .object({
    start: isoDateTime,
    end: isoDateTime.optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.end !== undefined && Date.parse(o.end) < Date.parse(o.start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end"], message: "end must not be before start" });
    }
  });

const scheduleSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    start: isoDateTime,
    end: isoDateTime.optional(),
    allDay: z.boolean(),
    recurrenceText: z.string().max(200).optional(),
    occurrences: z.array(occurrenceSchema).max(EVENTS_LIMITS.maxOccurrences).default([]),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.end !== undefined && Date.parse(s.end) < Date.parse(s.start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end"], message: "end must not be before start" });
    }
  });

const locationSchema = z
  .object({
    venueName: z.string().max(200).optional(),
    address: z.string().max(300).optional(),
    city: z.string().min(1).max(100),
    region: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().min(1).max(100),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    setting: z.enum(["indoor", "outdoor", "mixed", "unknown"]),
    online: z.boolean(),
    accessibilityNotes: z.string().max(500).optional(),
    parkingNotes: z.string().max(500).optional(),
  })
  .strict();

const costSchema = z
  .object({
    isFree: z.boolean(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    priceText: z.string().max(300).optional(),
    ticketRequired: z.boolean(),
    registrationRequired: z.boolean(),
    ticketUrl: httpsUrl.optional(),
    registrationUrl: httpsUrl.optional(),
  })
  .strict();

const audienceSchema = z
  .object({
    ageBands: z.array(z.enum(AGE_BANDS)).min(1).max(8),
    ageMin: z.number().int().min(0).max(120).optional(),
    ageMax: z.number().int().min(0).max(120).optional(),
    familyFriendly: z.boolean(),
    strollerFriendly: z.boolean().optional(),
    languages: languagesSchema.default([]),
  })
  .strict();

const organizerSchema = z
  .object({
    name: z.string().min(1).max(200),
    url: httpsUrl.optional(),
    contact: z.string().max(200).optional(),
  })
  .strict();

const mediaSchema = z
  .object({
    imageUrl: httpsUrl.optional(),
    imageAlt: z.string().max(300).optional(),
  })
  .strict();

const sourceSchema = z
  .object({
    url: httpsUrl,
    title: z.string().max(300).optional(),
    publisher: z.string().max(200).optional(),
    kind: z.enum(["official", "listing", "social", "news", "other"]),
    retrievedAt: isoDateTime,
  })
  .strict();

const updateSchema = z
  .object({
    at: isoDateTime,
    kind: z.enum(EVENT_UPDATE_KINDS),
    summary: z.string().min(1).max(500),
    field: z.string().max(60).optional(),
    before: z.string().max(300).optional(),
    after: z.string().max(300).optional(),
    sourceUrl: httpsUrl.optional(),
  })
  .strict();

const verificationSchema = z
  .object({
    lastCheckedAt: isoDateTime,
    lastChangedAt: isoDateTime.optional(),
    checkCount: z.number().int().min(0),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const ffEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
    fingerprint: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(280),
    description: z.string().min(1).max(5000),
    category: z.enum(EVENT_CATEGORIES),
    tags: z.array(z.string().min(1).max(40)).max(EVENTS_LIMITS.maxTags).default([]),
    schedule: scheduleSchema,
    location: locationSchema,
    cost: costSchema,
    audience: audienceSchema,
    organizer: organizerSchema.optional(),
    media: mediaSchema.optional(),
    sources: z.array(sourceSchema).min(1).max(EVENTS_LIMITS.maxSources),
    status: z.enum(EVENT_STATUSES),
    statusNote: z.string().max(500).optional(),
    // Append-only history: the dispatcher appends, the UI shows a timeline.
    updates: z.array(updateSchema).max(EVENTS_LIMITS.maxUpdates).default([]),
    verification: verificationSchema,
    firstSeenAt: isoDateTime,
  })
  .strict();
export type FfEvent = z.infer<typeof ffEventSchema>;

const shortLines = z.array(z.string().min(1).max(200)).max(5);

export const recommendationInputSchema = z
  .object({
    event: ffEventSchema,
    whyForHousehold: z.string().min(1).max(1000),
    whyForChildren: z.string().max(1000).optional(),
    highlights: shortLines.default([]),
    tips: shortLines.default([]),
    matchScore: z.number().min(0).max(1),
    matchReasons: shortLines.default([]),
    distanceKm: z.number().min(0).optional(),
    travelMinutes: z.number().int().min(0).optional(),
  })
  .strict();
export type RecommendationInput = z.infer<typeof recommendationInputSchema>;

export const putRecommendationsSchema = z
  .object({
    runId: z.string().min(1).max(80),
    recommendations: z.array(recommendationInputSchema).min(1).max(EVENTS_LIMITS.maxBatch),
  })
  .strict();
export type PutRecommendations = z.infer<typeof putRecommendationsSchema>;

export const eventPreferencesSchema = z
  .object({
    likedCategories: z.array(z.enum(EVENT_CATEGORIES)).default([]),
    avoidedCategories: z.array(z.enum(EVENT_CATEGORIES)).default([]),
    maxDistanceKm: z.number().min(1).max(300).default(30),
    budget: z.enum(["free", "low", "any"]).default("any"),
    preferredDays: z.array(z.enum(["weekday", "weekend"])).default([]),
    preferredTimes: z.array(z.enum(["morning", "afternoon", "evening"])).default([]),
    languages: languagesSchema.default([]),
    notes: z.string().max(1000).default(""),
  })
  .strict();
export type EventPreferences = z.infer<typeof eventPreferencesSchema>;

const feedbackSignalSchema = z.union([
  z.enum(FEEDBACK_SIGNALS),
  z.enum([
    "response:interested",
    "response:going",
    "response:maybe",
    "response:not-interested",
    "response:dismissed",
  ]),
]);

export const feedbackEntrySchema = z
  .object({
    id: z.string().min(1).max(128),
    at: isoDateTime,
    eventId: z.string().min(1).max(80),
    signal: feedbackSignalSchema,
    reason: z.string().max(EVENTS_LIMITS.maxFeedbackReason).optional(),
    snapshot: z
      .object({
        title: z.string().max(200),
        category: z.enum(EVENT_CATEGORIES),
        tags: z.array(z.string().max(40)).max(EVENTS_LIMITS.maxTags),
        isFree: z.boolean(),
        distanceKm: z.number().optional(),
        weekday: z.number().int().min(0).max(6),
        ageBands: z.array(z.enum(AGE_BANDS)).max(8),
      })
      .strict(),
  })
  .strict();
export type FeedbackEntry = z.infer<typeof feedbackEntrySchema>;

export const postFeedbackSchema = z
  .object({
    signal: z.enum(FEEDBACK_SIGNALS),
    reason: z.string().max(EVENTS_LIMITS.maxFeedbackReason).optional(),
  })
  .strict();
export type PostFeedback = z.infer<typeof postFeedbackSchema>;

export const postResponseSchema = z
  .object({
    response: z.enum(["interested", "going", "maybe", "not-interested", "dismissed"]),
    addToCalendar: z.boolean().optional(),
    visibility: visibilitySchema.optional(),
    people: z.array(z.string().max(80)).max(20).optional(),
    reason: z.string().max(EVENTS_LIMITS.maxFeedbackReason).optional(),
  })
  .strict();
export type PostResponse = z.infer<typeof postResponseSchema>;

export const patchPlanSchema = z
  .object({
    occurrenceStart: isoDateTime.optional(),
    notes: z.string().max(500).optional(),
    people: z.array(z.string()).max(20).optional(),
    visibility: visibilitySchema.optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, "At least one field is required");
export type PatchPlan = z.infer<typeof patchPlanSchema>;

export const SAMPLE_EVENT: FfEvent = {
  schemaVersion: 1,
  id: "pumpkin-festival-2026",
  fingerprint: "family-pumpkin-festival|2026-10-24|riverside-farm",
  title: "Riverside Family Pumpkin Festival",
  summary: "Pumpkin patch, hayrides and a costume parade for all ages.",
  description:
    "A Saturday harvest festival at Riverside Farm with a pumpkin patch, hayrides, a petting corner, " +
    "face painting, local food trucks and a children's costume parade at noon.",
  category: "holiday-seasonal",
  tags: ["pumpkins", "hayride", "costume-parade", "harvest"],
  schedule: {
    timezone: "America/Los_Angeles",
    start: "2026-10-24T10:00:00-07:00",
    end: "2026-10-24T16:00:00-07:00",
    allDay: false,
    recurrenceText: "Saturdays and Sundays in October",
    occurrences: [
      { start: "2026-10-24T10:00:00-07:00", end: "2026-10-24T16:00:00-07:00" },
      { start: "2026-10-25T10:00:00-07:00", end: "2026-10-25T16:00:00-07:00" },
    ],
  },
  location: {
    venueName: "Riverside Farm",
    address: "1200 River Road",
    city: "Portland",
    region: "OR",
    postalCode: "97201",
    country: "United States",
    lat: 45.5152,
    lon: -122.6784,
    setting: "outdoor",
    online: false,
    accessibilityNotes: "Main paths are gravel; stroller friendly.",
    parkingNotes: "Free field parking, opens 9:30 AM.",
  },
  cost: {
    isFree: false,
    currency: "USD",
    minPrice: 0,
    maxPrice: 12,
    priceText: "Entry free for under 2; $8 adults, $12 with hayride.",
    ticketRequired: false,
    registrationRequired: false,
    ticketUrl: "https://riversidefarm.example/tickets",
  },
  audience: {
    ageBands: ["baby", "toddler", "preschool", "school-age", "adult"],
    ageMin: 0,
    familyFriendly: true,
    strollerFriendly: true,
    languages: ["en"],
  },
  organizer: {
    name: "Riverside Farm",
    url: "https://riversidefarm.example",
    contact: "hello@riversidefarm.example",
  },
  media: {
    imageUrl: "https://riversidefarm.example/img/pumpkins.jpg",
    imageAlt: "Children choosing pumpkins in a field",
  },
  sources: [
    {
      url: "https://riversidefarm.example/pumpkin-festival",
      title: "Pumpkin Festival",
      publisher: "Riverside Farm",
      kind: "official",
      retrievedAt: "2026-10-09T08:00:00-07:00",
    },
    {
      url: "https://localevents.example/portland/pumpkin-festival",
      title: "Riverside Family Pumpkin Festival",
      publisher: "Local Events",
      kind: "listing",
      retrievedAt: "2026-10-09T08:05:00-07:00",
    },
  ],
  status: "scheduled",
  statusNote: "Rain or shine.",
  updates: [
    {
      at: "2026-10-09T08:00:00-07:00",
      kind: "price-changed",
      summary: "Adult entry raised by $2.",
      field: "cost.maxPrice",
      before: "$10",
      after: "$12",
      sourceUrl: "https://riversidefarm.example/pumpkin-festival",
    },
  ],
  verification: {
    lastCheckedAt: "2026-10-09T08:05:00-07:00",
    lastChangedAt: "2026-10-09T08:00:00-07:00",
    checkCount: 3,
    confidence: 0.9,
  },
  firstSeenAt: "2026-09-20T08:00:00-07:00",
};

export const SAMPLE_RECOMMENDATION_INPUT: RecommendationInput = {
  event: SAMPLE_EVENT,
  whyForHousehold: "A relaxed outdoor Saturday close to home that the whole family can enjoy together.",
  whyForChildren: "Hands-on pumpkin picking, animals and a costume parade suit toddlers through school age.",
  highlights: ["Costume parade at noon", "Hayrides", "Petting corner"],
  tips: ["Arrive before 11 for easy parking", "Bring boots; fields can be muddy"],
  matchScore: 0.87,
  matchReasons: ["Liked seasonal events", "Within 10 km", "Weekend morning"],
  distanceKm: 8.4,
  travelMinutes: 18,
};

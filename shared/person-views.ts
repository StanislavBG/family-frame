// Reserved, read-only dataset formats owned by Family Frame. Any agent can
// publish records into them; the People app's Sheets and Dashboard tabs render them.

export const PERSON_DAY_SCHEMA_ID = "ff-person-day";
export const PERSON_WEEK_SCHEMA_ID = "ff-person-week";
export const RESERVED_SCHEMA_PREFIX = "ff-";

const TIME = { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" } as const;
const DATE = { type: "string", format: "date" } as const;

const METRIC = {
  type: "object",
  properties: {
    label: { type: "string", minLength: 1, maxLength: 40 },
    value: { type: "string", minLength: 1, maxLength: 40 },
    tone: { enum: ["neutral", "good", "warn", "info"] },
  },
  required: ["label", "value"],
  additionalProperties: false,
} as const;

const idList = (max: number) => ({
  type: "array",
  maxItems: max,
  items: { type: "string", minLength: 1, maxLength: 128 },
});

export const PERSON_DAY_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    date: DATE,
    title: { type: "string", minLength: 1, maxLength: 200 },
    source: { type: "string", maxLength: 120 },
    summary: { type: "string", maxLength: 2000 },
    metrics: { type: "array", maxItems: 12, items: METRIC },
    tags: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          label: { type: "string", minLength: 1, maxLength: 120 },
          group: { type: "string", maxLength: 40 },
        },
        required: ["label"],
        additionalProperties: false,
      },
    },
    highlights: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 80 },
          text: { type: "string", minLength: 1, maxLength: 1000 },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    timeline: {
      type: "object",
      properties: {
        start: TIME,
        end: TIME,
        spans: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              start: TIME,
              end: TIME,
              label: { type: "string", minLength: 1, maxLength: 40 },
            },
            required: ["start", "end", "label"],
            additionalProperties: false,
          },
        },
        events: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              time: TIME,
              kind: { type: "string", minLength: 1, maxLength: 24 },
              label: { type: "string", minLength: 1, maxLength: 60 },
            },
            required: ["time", "kind", "label"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    mediaIds: idList(50),
    emailIds: idList(20),
    sourceUrl: { type: "string", format: "uri", maxLength: 2048, pattern: "^https://" },
    sentAt: { type: "string", format: "date-time" },
  },
  required: ["date", "title"],
  additionalProperties: false,
} as const;

export const PERSON_WEEK_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    weekStart: DATE,
    title: { type: "string", minLength: 1, maxLength: 200 },
    summary: { type: "string", maxLength: 4000 },
    metrics: { type: "array", maxItems: 12, items: METRIC },
    highlights: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          date: DATE,
          text: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    emailIds: idList(20),
  },
  required: ["weekStart", "title"],
  additionalProperties: false,
} as const;

export const PERSON_DAY_TITLE = "Person day";
export const PERSON_DAY_DESCRIPTION =
  "One person's day: a daycare daily sheet, a school day or report. Record-level personIds say who it is about; suggested record id <personId>-<YYYY-MM-DD>.";
export const PERSON_WEEK_TITLE = "Person week";
export const PERSON_WEEK_DESCRIPTION =
  "One person's week summary. Suggested record id <personId>-<weekStart>.";

export type PersonTone = "neutral" | "good" | "warn" | "info";

export interface PersonMetric {
  label: string;
  value: string;
  tone?: PersonTone;
}

export interface PersonHighlight {
  title?: string;
  text: string;
}

export interface PersonTimeline {
  start?: string;
  end?: string;
  spans?: { start: string; end: string; label: string }[];
  events?: { time: string; kind: string; label: string }[];
}

export interface PersonDay {
  date: string;
  title: string;
  source?: string;
  summary?: string;
  metrics?: PersonMetric[];
  tags?: { label: string; group?: string }[];
  highlights?: PersonHighlight[];
  timeline?: PersonTimeline;
  mediaIds?: string[];
  emailIds?: string[];
  sourceUrl?: string;
  sentAt?: string;
}

export interface PersonWeek {
  weekStart: string;
  title: string;
  summary?: string;
  metrics?: PersonMetric[];
  highlights?: { date?: string; text: string }[];
  emailIds?: string[];
}

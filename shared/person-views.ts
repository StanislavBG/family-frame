// Reserved, read-only dataset formats owned by Family Frame. Any agent can
// publish records into them; the People app's Sheets and Dashboard tabs render them.

export const PERSON_DAY_SCHEMA_ID = "ff-person-day";
export const PERSON_WEEK_SCHEMA_ID = "ff-person-week";
export const PERSON_VIEW_SCHEMA_ID = "ff-person-view";
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

export const FIELD_PATH_PATTERN = "^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+){0,5}$";
export const PERSON_VIEW_BLOCK_TYPES = ["metrics", "list", "chart", "photos", "text"] as const;
export const PERSON_VIEW_ICONS = ["star", "heart", "book", "music", "trophy", "leaf", "sun", "moon", "activity", "utensils", "graduation-cap", "baby", "home", "sparkles", "mail"] as const;
const PERSON_VIEW_TONES = ["clay", "sun", "leaf", "sky", "plum", "stone"] as const;

const FIELD_PATH = { type: "string", pattern: FIELD_PATH_PATTERN, maxLength: 100 } as const;
const REF_ID = { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9-]*$" } as const;
const VIEW_TONE = { enum: PERSON_VIEW_TONES } as const;
const BLOCK_TITLE = { type: "string", minLength: 1, maxLength: 60 } as const;
const UNIT = { type: "string", minLength: 1, maxLength: 12 } as const;

export const PERSON_VIEW_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 40 },
    icon: { enum: PERSON_VIEW_ICONS },
    tone: VIEW_TONE,
    order: { type: "integer", minimum: 0, maximum: 99 },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              type: { const: "metrics" },
              title: BLOCK_TITLE,
              source: { type: "object", properties: { schemaId: REF_ID }, required: ["schemaId"], additionalProperties: false },
              fields: {
                type: "array",
                minItems: 1,
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    field: FIELD_PATH,
                    label: { type: "string", minLength: 1, maxLength: 30 },
                    unit: UNIT,
                    tone: VIEW_TONE,
                  },
                  required: ["field", "label"],
                  additionalProperties: false,
                },
              },
            },
            required: ["type", "source", "fields"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "list" },
              title: BLOCK_TITLE,
              source: { type: "object", properties: { schemaId: REF_ID }, required: ["schemaId"], additionalProperties: false },
              titleField: FIELD_PATH,
              subtitleField: FIELD_PATH,
              dateField: FIELD_PATH,
              urlField: FIELD_PATH,
              sortField: FIELD_PATH,
              sortDir: { enum: ["asc", "desc"] },
              limit: { type: "integer", minimum: 1, maximum: 50 },
            },
            required: ["type", "source", "titleField"],
            dependentRequired: { sortDir: ["sortField"] },
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "chart" },
              title: BLOCK_TITLE,
              source: {
                oneOf: [
                  {
                    type: "object",
                    properties: { schemaId: REF_ID, xField: FIELD_PATH, yField: FIELD_PATH },
                    required: ["schemaId", "xField", "yField"],
                    additionalProperties: false,
                  },
                  {
                    type: "object",
                    properties: { seriesId: REF_ID },
                    required: ["seriesId"],
                    additionalProperties: false,
                  },
                ],
              },
              unit: UNIT,
              limit: { type: "integer", minimum: 2, maximum: 365 },
            },
            required: ["type", "source"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "photos" },
              title: BLOCK_TITLE,
              tag: { type: "string", minLength: 1, maxLength: 64 },
              limit: { type: "integer", minimum: 1, maximum: 24 },
            },
            required: ["type"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "text" },
              title: BLOCK_TITLE,
              text: { type: "string", minLength: 1, maxLength: 2000 },
            },
            required: ["type", "text"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["title", "blocks"],
  additionalProperties: false,
} as const;

export const PERSON_VIEW_TITLE = "Person view";
export const PERSON_VIEW_DESCRIPTION =
  "A custom People section: blocks bound to your own datasets and series; personIds pick whose People page shows it.";

export type PersonViewTone = (typeof PERSON_VIEW_TONES)[number];
export type PersonViewIcon = (typeof PERSON_VIEW_ICONS)[number];

export type PersonViewBlock =
  | { type: "metrics"; title?: string; source: { schemaId: string }; fields: { field: string; label: string; unit?: string; tone?: PersonViewTone }[] }
  | { type: "list"; title?: string; source: { schemaId: string }; titleField: string; subtitleField?: string; dateField?: string; urlField?: string; sortField?: string; sortDir?: "asc" | "desc"; limit?: number }
  | { type: "chart"; title?: string; source: { schemaId: string; xField: string; yField: string } | { seriesId: string }; unit?: string; limit?: number }
  | { type: "photos"; title?: string; tag?: string; limit?: number }
  | { type: "text"; title?: string; text: string };

export interface PersonView {
  title: string;
  icon?: PersonViewIcon;
  tone?: PersonViewTone;
  order?: number;
  blocks: PersonViewBlock[];
}

/** Walk a dotted path through plain objects; undefined on any miss. Never throws. */
export function getFieldPath(data: unknown, path: string): unknown {
  if (typeof path !== "string" || path === "") return undefined;
  let cur: unknown = data;
  for (const key of path.split(".")) {
    if (key === "" || cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

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

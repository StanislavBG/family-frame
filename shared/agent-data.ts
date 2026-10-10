import { z } from "zod";

// Schemas, types and limits for agent-published stores: the per-user mailbox
// and custom datasets defined by an agent-uploaded JSON Schema.

// Firebase RTDB key-safe (no . / $ # [ ] and no control chars)
export const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const SCHEMA_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const MAIL_LIMITS = {
  batchMax: 50,
  textMax: 200_000,
  subjectMax: 1000,
  snippetMax: 500,
  labelsMax: 20,
  labelMax: 64,
  kindMax: 40,
  recipientsMax: 100,
  imageUrlsMax: 50,
  attachmentsMax: 50,
  mediaIdsMax: 50,
  urlMax: 2048,
  sourceMax: 60,
  mailboxMax: 2000,
  listLimitDefault: 50,
  listLimitMax: 200,
} as const;

export const DATA_LIMITS = {
  schemasPerUserMax: 20,
  schemaBytesMax: 65_536,
  recordBytesMax: 262_144,
  recordsPerDatasetMax: 5000,
  batchMax: 100,
  emailIdsMax: 20,
  titleMax: 120,
  descriptionMax: 2000,
  listLimitDefault: 100,
  listLimitMax: 500,
} as const;

const agentIdSchema = z.string().regex(AGENT_ID_PATTERN);

const httpsUrlSchema = z
  .string()
  .max(MAIL_LIMITS.urlMax)
  .url()
  .refine((u) => u.startsWith("https://"), "Must be an https URL");

const emailAddressSchema = z
  .object({
    name: z.string().max(200).optional(),
    email: z.string().min(1).max(320),
  })
  .strict();

// Metadata only; no binary content.
const emailAttachmentSchema = z
  .object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().max(255),
    size: z.number().int().nonnegative().optional(),
    url: httpsUrlSchema.optional(),
    // Loose link to an uploaded media file; existence is not checked.
    mediaId: agentIdSchema.optional(),
  })
  .strict();

// No HTML field by design: rendering untrusted HTML is out of scope.
export const insertEmailSchema = z
  .object({
    id: agentIdSchema,
    threadId: agentIdSchema.optional(),
    messageId: z.string().max(998).optional(),
    receivedAt: z.string().datetime({ offset: true }),
    from: emailAddressSchema,
    to: z.array(emailAddressSchema).max(MAIL_LIMITS.recipientsMax).optional(),
    cc: z.array(emailAddressSchema).max(MAIL_LIMITS.recipientsMax).optional(),
    subject: z.string().max(MAIL_LIMITS.subjectMax),
    snippet: z.string().max(MAIL_LIMITS.snippetMax).optional(),
    text: z.string().max(MAIL_LIMITS.textMax),
    labels: z.array(z.string().min(1).max(MAIL_LIMITS.labelMax)).max(MAIL_LIMITS.labelsMax).optional(),
    kind: z.string().min(1).max(MAIL_LIMITS.kindMax).optional(),
    imageUrls: z.array(httpsUrlSchema).max(MAIL_LIMITS.imageUrlsMax).optional(),
    attachments: z.array(emailAttachmentSchema).max(MAIL_LIMITS.attachmentsMax).optional(),
    // Loose links to uploaded media (/api/files). Ids are NOT checked for existence:
    // media may be uploaded before or after the email.
    mediaIds: z.array(agentIdSchema).max(MAIL_LIMITS.mediaIdsMax).optional(),
    source: z.string().max(MAIL_LIMITS.sourceMax).optional(),
    sourceUrl: httpsUrlSchema.optional(),
  })
  .strict();

// Server-normalized shape (arrays always present).
export const emailMessageSchema = insertEmailSchema.extend({
  snippet: z.string(),
  to: z.array(emailAddressSchema),
  cc: z.array(emailAddressSchema),
  labels: z.array(z.string()),
  imageUrls: z.array(z.string()),
  attachments: z.array(emailAttachmentSchema),
  mediaIds: z.array(z.string()),
  ingestedAt: z.string(),
  updatedAt: z.string(),
  readAt: z.string().nullable(),
});

export const emailSummarySchema = emailMessageSchema.omit({ text: true });

export const upsertEmailsSchema = z
  .object({ emails: z.array(insertEmailSchema).min(1).max(MAIL_LIMITS.batchMax) })
  .strict();

export const markEmailsReadSchema = z
  .object({
    ids: z.union([z.literal("all"), z.array(agentIdSchema).min(1).max(200)]),
    read: z.boolean().optional(),
  })
  .strict();

export const putDataSchemaSchema = z
  .object({
    title: z.string().min(1).max(DATA_LIMITS.titleMax),
    description: z.string().max(DATA_LIMITS.descriptionMax).optional(),
    jsonSchema: z.record(z.unknown()),
  })
  .strict();

export const dataSchemaSchema = putDataSchemaSchema.extend({
  id: z.string().regex(SCHEMA_ID_PATTERN),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertDataRecordSchema = z
  .object({
    id: agentIdSchema,
    data: z.unknown(),
    emailIds: z.array(agentIdSchema).max(DATA_LIMITS.emailIdsMax).optional(),
  })
  .strict()
  .refine((r) => r.data !== undefined, { message: "data is required", path: ["data"] });

export const dataRecordSchema = z.object({
  id: z.string(),
  schemaId: z.string(),
  schemaVersion: z.number().int(),
  data: z.unknown(),
  emailIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const putDataRecordsSchema = z
  .object({ records: z.array(insertDataRecordSchema).min(1).max(DATA_LIMITS.batchMax) })
  .strict();

export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type EmailMessage = z.infer<typeof emailMessageSchema>;
export type EmailSummary = z.infer<typeof emailSummarySchema>;
export type PutDataSchema = z.infer<typeof putDataSchemaSchema>;
export type DataSchema = z.infer<typeof dataSchemaSchema>;
export type InsertDataRecord = z.infer<typeof insertDataRecordSchema>;
export type DataRecord = z.infer<typeof dataRecordSchema>;

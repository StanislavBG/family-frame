import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_ID_PATTERN,
  SCHEMA_ID_PATTERN,
  MAIL_LIMITS,
  DATA_LIMITS,
  insertEmailSchema,
  emailMessageSchema,
  emailSummarySchema,
  upsertEmailsSchema,
  markEmailsReadSchema,
  putDataSchemaSchema,
  dataSchemaSchema,
  insertDataRecordSchema,
  dataRecordSchema,
  putDataRecordsSchema,
} from "../shared/agent-data";

const validEmail = {
  id: "msg_123-abc",
  receivedAt: "2026-01-02T03:04:05Z",
  from: { name: "Teacher", email: "t@school.example" },
  subject: "Hello",
  text: "Body",
};

test("constants: patterns and limits", () => {
  assert.equal(AGENT_ID_PATTERN.test("abc_DEF-1"), true);
  assert.equal(AGENT_ID_PATTERN.test(""), false);
  assert.equal(AGENT_ID_PATTERN.test("a".repeat(129)), false);
  assert.equal(SCHEMA_ID_PATTERN.test("school-email"), true);
  assert.equal(SCHEMA_ID_PATTERN.test("-bad"), false);
  assert.equal(SCHEMA_ID_PATTERN.test("Upper"), false);
  assert.equal(MAIL_LIMITS.batchMax, 50);
  assert.equal(MAIL_LIMITS.textMax, 200_000);
  assert.equal(DATA_LIMITS.batchMax, 100);
  assert.equal(DATA_LIMITS.recordBytesMax, 262_144);
});

test("email: accepts minimal and full bodies", () => {
  assert.equal(insertEmailSchema.safeParse(validEmail).success, true);
  assert.equal(
    insertEmailSchema.safeParse({
      ...validEmail,
      threadId: "t1",
      to: [{ email: "a@b.example" }],
      cc: [],
      labels: ["inbox"],
      kind: "school",
      imageUrls: ["https://example.com/a.png"],
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", size: 10, url: "https://example.com/a.pdf" }],
      source: "self",
      sourceUrl: "https://example.com/m",
      receivedAt: "2026-01-02T03:04:05+02:00",
    }).success,
    true,
  );
});

test("email: rejects ids with unsafe characters", () => {
  for (const ch of [".", "/", "$", "#", "[", "]", "<"]) {
    assert.equal(insertEmailSchema.safeParse({ ...validEmail, id: `a${ch}b` }).success, false, ch);
  }
});

test("email: rejects non-https urls", () => {
  for (const url of ["http://example.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA"]) {
    assert.equal(insertEmailSchema.safeParse({ ...validEmail, imageUrls: [url] }).success, false, url);
    assert.equal(insertEmailSchema.safeParse({ ...validEmail, sourceUrl: url }).success, false, url);
  }
});

test("email: enforces text limit and strictness", () => {
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, text: "a".repeat(200_000) }).success, true);
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, text: "a".repeat(200_001) }).success, false);
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, html: "<b>x</b>" }).success, false);
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, receivedAt: "yesterday" }).success, false);
});

test("email: batch and mark-read schemas", () => {
  assert.equal(upsertEmailsSchema.safeParse({ emails: [] }).success, false);
  assert.equal(upsertEmailsSchema.safeParse({ emails: [validEmail] }).success, true);
  assert.equal(
    upsertEmailsSchema.safeParse({ emails: Array.from({ length: 51 }, () => validEmail) }).success,
    false,
  );
  assert.equal(markEmailsReadSchema.safeParse({ ids: "all" }).success, true);
  assert.equal(markEmailsReadSchema.safeParse({ ids: ["a", "b"], read: false }).success, true);
  assert.equal(markEmailsReadSchema.safeParse({ ids: [] }).success, false);
  assert.equal(markEmailsReadSchema.safeParse({ ids: ["a.b"] }).success, false);
});

test("email: normalized message and summary shapes", () => {
  const msg = {
    ...validEmail,
    snippet: "",
    to: [],
    cc: [],
    labels: [],
    imageUrls: [],
    attachments: [],
    mediaIds: [],
    ingestedAt: "2026-01-02T03:04:06Z",
    updatedAt: "2026-01-02T03:04:06Z",
    readAt: null,
  };
  assert.equal(emailMessageSchema.safeParse(msg).success, true);
  const { mediaIds: _m, ...noMedia } = msg;
  assert.equal(emailMessageSchema.safeParse(noMedia).success, false);
  const { text: _text, ...noText } = msg;
  assert.equal(emailSummarySchema.safeParse(noText).success, true);
  assert.equal("text" in emailSummarySchema.shape, false);
});

test("data schema: put and stored shapes", () => {
  const put = { title: "School", jsonSchema: { type: "object" } };
  assert.equal(putDataSchemaSchema.safeParse(put).success, true);
  assert.equal(putDataSchemaSchema.safeParse({ ...put, title: "" }).success, false);
  assert.equal(putDataSchemaSchema.safeParse({ title: "x" }).success, false);
  assert.equal(putDataSchemaSchema.safeParse({ ...put, extra: 1 }).success, false);
  const stored = { ...put, id: "school-email", version: 1, createdAt: "a", updatedAt: "b" };
  assert.equal(dataSchemaSchema.safeParse(stored).success, true);
  assert.equal(dataSchemaSchema.safeParse({ ...stored, id: "Bad_Id" }).success, false);
  assert.equal(dataSchemaSchema.safeParse({ ...stored, version: 0 }).success, false);
});

test("data record: requires data, accepts any JSON type", () => {
  assert.equal(insertDataRecordSchema.safeParse({ id: "r1" }).success, false);
  assert.equal(insertDataRecordSchema.safeParse({ id: "r1", data: undefined }).success, false);
  for (const data of [null, 0, "s", true, [], [1, { a: null }], {}, { a: { b: [1] } }]) {
    assert.equal(insertDataRecordSchema.safeParse({ id: "r1", data }).success, true, JSON.stringify(data));
  }
  assert.equal(insertDataRecordSchema.safeParse({ id: "r.1", data: 1 }).success, false);
  assert.equal(insertDataRecordSchema.safeParse({ id: "r1", data: 1, emailIds: ["e1"] }).success, true);
  assert.equal(insertDataRecordSchema.safeParse({ id: "r1", data: 1, extra: 1 }).success, false);
});

test("data record: batch and stored shape", () => {
  assert.equal(putDataRecordsSchema.safeParse({ records: [] }).success, false);
  assert.equal(putDataRecordsSchema.safeParse({ records: [{ id: "a", data: null }] }).success, true);
  assert.equal(
    putDataRecordsSchema.safeParse({ records: Array.from({ length: 101 }, (_, i) => ({ id: `r${i}`, data: 1 })) }).success,
    false,
  );
  assert.equal(
    dataRecordSchema.safeParse({
      id: "a",
      schemaId: "s",
      schemaVersion: 1,
      data: null,
      emailIds: [],
      createdAt: "x",
      updatedAt: "y",
    }).success,
    true,
  );
});

test("email: mediaIds and attachment mediaId validation", () => {
  assert.equal(MAIL_LIMITS.mediaIdsMax, 50);
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, mediaIds: ["m1", "m_2-x"] }).success, true);
  assert.equal(
    insertEmailSchema.safeParse({
      ...validEmail,
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", mediaId: "m1" }],
    }).success,
    true,
  );
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, mediaIds: ["a.b"] }).success, false);
  assert.equal(
    insertEmailSchema.safeParse({
      ...validEmail,
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", mediaId: "a.b" }],
    }).success,
    false,
  );
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, mediaIds: ids(50) }).success, true);
  assert.equal(insertEmailSchema.safeParse({ ...validEmail, mediaIds: ids(51) }).success, false);
});

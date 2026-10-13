import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { PERSON_DAY_JSON_SCHEMA } from "../shared/person-views";
import { applyOrganized, type OrganizeDeps } from "./household-inbox-organize";
import { HouseholdInboxError } from "./household-inbox-service";

const Ajv: typeof Ajv2020 = (Ajv2020 as any).default ?? Ajv2020;
const fmt: any = (addFormats as any).default ?? addFormats;

const MAIL = {
  id: "hh-1",
  from: "a@b.co",
  receivedAt: "2026-10-01T10:00:00Z",
  subject: "Bill",
  text: "body",
  snippet: "s",
  to: [],
  cc: [],
  labels: [],
  imageUrls: [],
  attachments: [],
  mediaIds: [],
  personIds: [],
  ingestedAt: "x",
  updatedAt: "y",
  readAt: null,
};

function makeDeps() {
  const calls = { putSeries: [] as any[], putPoints: [] as any[], putRecords: [] as any[], upsert: [] as any[] };
  const existing = new Set<string>();
  const deps: OrganizeDeps = {
    mail: {
      getEmail: async (_u: string, id: string) => (id === "hh-1" ? (MAIL as any) : null),
      upsertEmails: async (_u: string, input: any) => {
        calls.upsert.push(input);
        return {} as any;
      },
    },
    series: {
      getSeries: async (_u: string, id: string) => {
        if (!existing.has(id)) throw Object.assign(new Error("nf"), { status: 404 });
        return {} as any;
      },
      putSeries: async (_u: string, id: string, input: any) => {
        existing.add(id);
        calls.putSeries.push({ id, input });
        return {} as any;
      },
      putPoints: async (_u: string, id: string, input: any) => {
        calls.putPoints.push({ id, input });
        return {} as any;
      },
    },
    datasets: {
      putRecords: async (_u: string, schemaId: string, input: any) => {
        calls.putRecords.push({ schemaId, input });
        return {} as any;
      },
    },
    getPeople: async () => [{ id: "p1", name: "Ana" }],
  } as OrganizeDeps;
  return { deps, calls, existing };
}

const bill = { vendor: "Puget Sound Energy", category: "gas", amount: 84.12, currency: "USD", billDate: "2026-09-05", dueDate: "2026-09-26" };

test("bill: creates series, point, tags email", async () => {
  const { deps, calls } = makeDeps();
  const r = await applyOrganized("u", { mailId: "hh-1", kind: "bill", bill }, deps);
  assert.deepEqual(r, { applied: "bill", seriesId: "mail-puget-sound-energy-gas" });
  assert.deepEqual(calls.putSeries[0].input.tags, ["utilities"]);
  assert.equal(calls.putSeries[0].input.unit, "USD");
  assert.equal(calls.putSeries[0].input.annotations.category, "Gas");
  assert.deepEqual(calls.putPoints[0].input.points, [
    { t: "2026-09-05", value: 84.12, annotations: { dueDate: "2026-09-26", emailId: "hh-1", currency: "USD" } },
  ]);
  assert.equal(calls.upsert[0].emails[0].kind, "bill");
  assert.equal(calls.upsert[0].emails[0].subject, "Bill");
  assert.equal("ingestedAt" in calls.upsert[0].emails[0], false);
});

test("bill: existing series not overwritten; re-apply idempotent", async () => {
  const { deps, calls, existing } = makeDeps();
  existing.add("mail-puget-sound-energy-gas");
  await applyOrganized("u", { mailId: "hh-1", kind: "bill", bill }, deps);
  assert.equal(calls.putSeries.length, 0);
  await applyOrganized("u", { mailId: "hh-1", kind: "bill", bill }, deps);
  assert.equal(calls.putSeries.length, 0);
  assert.deepEqual(calls.putPoints[0], calls.putPoints[1]);
});

test("bill: series id capped at 64 chars", async () => {
  const { deps } = makeDeps();
  const r = await applyOrganized("u", { mailId: "hh-1", kind: "bill", bill: { ...bill, vendor: "V".repeat(80) } }, deps);
  assert.ok(r.seriesId!.length <= 64);
  assert.match(r.seriesId!, /^mail-[a-z0-9-]+-gas$/);
});

test("daily report: record valid against PERSON_DAY_JSON_SCHEMA", async () => {
  const { deps, calls } = makeDeps();
  const day = {
    personId: "p1",
    date: "2026-10-02",
    title: "Day at daycare",
    summary: "Good day",
    metrics: [{ label: "Meals", value: "3", tone: "good" }],
    highlights: [{ text: "Painted" }],
    napSpans: [{ start: "12:30", end: "14:00" }],
  };
  const r = await applyOrganized("u", { mailId: "hh-1", kind: "daily-report", day }, deps);
  assert.deepEqual(r, { applied: "daily-report", recordId: "mail-hh-1" });
  const call = calls.putRecords[0];
  assert.equal(call.schemaId, "ff-person-day");
  const rec = call.input.records[0];
  assert.equal(rec.id, "mail-hh-1");
  assert.deepEqual(rec.personIds, ["p1"]);
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  fmt(ajv);
  const validate = ajv.compile(PERSON_DAY_JSON_SCHEMA as any);
  assert.ok(validate(rec.data), JSON.stringify(validate.errors));
  assert.equal(rec.data.source, "household-email");
  assert.deepEqual(rec.data.emailIds, ["hh-1"]);
  assert.deepEqual(rec.data.timeline.spans, [{ start: "12:30", end: "14:00", label: "Nap" }]);
  assert.equal(calls.upsert[0].emails[0].kind, "daily-report");
});

test("daily report: unknown person 400", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    applyOrganized("u", { mailId: "hh-1", kind: "daily-report", day: { personId: "zz", date: "2026-10-02", title: "t" } }, deps),
    (e: any) => e instanceof HouseholdInboxError && e.status === 400,
  );
});

test("unknown mail 404", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    applyOrganized("u", { mailId: "hh-nope", kind: "bill", bill }, deps),
    (e: any) => e instanceof HouseholdInboxError && e.status === 404,
  );
});

test("other is a no-op; kind/payload mismatch is 400", async () => {
  const { deps, calls } = makeDeps();
  assert.deepEqual(await applyOrganized("u", { mailId: "hh-1", kind: "other" }, deps), { applied: "none" });
  assert.equal(calls.upsert.length + calls.putPoints.length + calls.putRecords.length, 0);
  await assert.rejects(
    applyOrganized("u", { mailId: "hh-1", kind: "bill" }, deps),
    (e: any) => e instanceof HouseholdInboxError && e.status === 400,
  );
});

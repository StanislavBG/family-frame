import { test } from "node:test";
import assert from "node:assert/strict";
import { createMailRehoster } from "./mail-rehost";
import { rehostIdForUrl } from "./media-import";

interface FakeEmail {
  id: string;
  receivedAt: string;
  imageUrls: string[];
  mediaIds: string[];
  personIds: string[];
  readAt: string | null;
  ingestedAt: string;
  updatedAt: string;
  text: string;
  subject: string;
}

const url = (n: number | string) => `https://cdn.example.com/img/${n}.jpg?token=secret${n}`;

function setup(emails: FakeEmail[], opts: { failing?: Set<string>; pageSize?: number } = {}) {
  const store = new Map<string, FakeEmail>(emails.map((e) => [e.id, structuredClone(e)]));
  const upserts: any[] = [];
  const imports: { url: string; tags?: string[]; emailIds?: string[]; personIds?: string[] }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const failing = opts.failing ?? new Set<string>();

  const mail: any = {
    async listEmails(_userId: string, o: { limit?: number; before?: string } = {}) {
      const all = [...store.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
      const filtered = o.before ? all.filter((e) => Date.parse(e.receivedAt) < Date.parse(o.before!)) : all;
      const limit = Math.min(o.limit ?? 50, opts.pageSize ?? 200);
      const page = filtered.slice(0, limit);
      return {
        emails: page.map(({ text, ...s }) => s),
        nextBefore: filtered.length > limit ? page[page.length - 1].receivedAt : null,
      };
    },
    async getEmail(_userId: string, id: string) {
      const e = store.get(id);
      return e ? structuredClone(e) : null;
    },
    async upsertEmails(_userId: string, input: any) {
      upserts.push(structuredClone(input));
      for (const e of input.emails) {
        const prev = store.get(e.id)!;
        store.set(e.id, { ...prev, ...e, readAt: prev.readAt });
      }
      return { created: 0, updated: input.emails.length, ids: input.emails.map((e: any) => e.id), pruned: 0 };
    },
  };
  const importer = {
    async importFromUrl(_userId: string, input: { url: string; tags?: string[]; emailIds?: string[]; personIds?: string[] }) {
      imports.push(input);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (failing.has(input.url)) throw new Error("Fetch failed");
      return { meta: { id: rehostIdForUrl(input.url) }, created: true, fetched: true };
    },
  };
  const db = new Map<string, any>();
  const rehoster = createMailRehoster({
    mail,
    importer: importer as any,
    get: async (p) => {
      if (db.has(p)) return structuredClone(db.get(p));
      const kids = [...db.entries()].filter(([k]) => k.startsWith(`${p}/`));
      return kids.length ? Object.fromEntries(kids.map(([k, v]) => [k.slice(p.length + 1), structuredClone(v)])) : null;
    },
    set: async (p, v) => void db.set(p, structuredClone(v)),
    now: () => new Date("2026-03-01T00:00:00.000Z"),
  });
  return { rehoster, store, upserts, imports, db, maxInFlight: () => maxInFlight };
}

const email = (id: string, urls: string[], extra: Partial<FakeEmail> = {}): FakeEmail => ({
  id,
  receivedAt: `2026-02-${id.padStart(2, "0").slice(-2)}T10:00:00.000Z`,
  imageUrls: urls,
  mediaIds: [],
  personIds: [],
  readAt: null,
  ingestedAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  text: "body",
  subject: "s",
  ...extra,
});

test("selects only emails with un-rehosted urls and records mediaIds", async () => {
  const done = email("10", [url(1)], { mediaIds: [rehostIdForUrl(url(1))] });
  const none = email("11", []);
  const todo = email("12", [url(2), url(3)]);
  const { rehoster, store, imports } = setup([done, none, todo]);
  const r = await rehoster.rehostEmailImages("u1", {});
  assert.deepEqual({ processed: r.processed, imported: r.imported, remaining: r.remaining }, { processed: 1, imported: 2, remaining: 0 });
  assert.deepEqual(r.failed, []);
  assert.deepEqual(store.get("12")!.mediaIds, [rehostIdForUrl(url(2)), rehostIdForUrl(url(3))]);
  assert.equal(imports.length, 2);
  for (const i of imports) {
    assert.deepEqual(i.tags, ["email"]);
    assert.deepEqual(i.emailIds, ["12"]);
    assert.equal(i.personIds, undefined);
  }
});

test("imports carry the parent email's personIds", async () => {
  const { rehoster, store, imports } = setup([email("12", [url(1), url(2)], { personIds: ["Evolet", "Mila"] })]);
  const r = await rehoster.rehostEmailImages("u1", {});
  assert.equal(r.imported, 2);
  for (const i of imports) assert.deepEqual(i.personIds, ["Evolet", "Mila"]);
  assert.deepEqual(store.get("12")!.personIds, ["Evolet", "Mila"]);
});

test("limit bounds the batch and remaining counts the rest", async () => {
  const { rehoster, store } = setup([email("10", [url(1)]), email("11", [url(2)]), email("12", [url(3)])]);
  const r1 = await rehoster.rehostEmailImages("u1", { limit: 2 });
  assert.deepEqual({ processed: r1.processed, remaining: r1.remaining }, { processed: 2, remaining: 1 });
  const r2 = await rehoster.rehostEmailImages("u1", { limit: 2 });
  assert.deepEqual({ processed: r2.processed, remaining: r2.remaining }, { processed: 1, remaining: 0 });
  assert.ok([...store.values()].every((e) => e.mediaIds.length === 1));
});

test("limit is capped at 50", async () => {
  const emails = Array.from({ length: 55 }, (_, i) => email(String(i + 1), [url(i)], { receivedAt: `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z` }));
  const { rehoster } = setup(emails, { pageSize: 20 });
  const r = await rehoster.rehostEmailImages("u1", { limit: 500 });
  assert.deepEqual({ processed: r.processed, remaining: r.remaining }, { processed: 50, remaining: 5 });
});

test("merge keeps existing ids first, appends new in imageUrls order, preserves readAt, strips server fields", async () => {
  const e = email("10", [url(1), url(2), url(3)], { mediaIds: ["manual1", rehostIdForUrl(url(2))], readAt: "2026-02-02T00:00:00.000Z" });
  const { rehoster, store, upserts } = setup([e]);
  await rehoster.rehostEmailImages("u1", {});
  assert.deepEqual(store.get("10")!.mediaIds, ["manual1", rehostIdForUrl(url(2)), rehostIdForUrl(url(1)), rehostIdForUrl(url(3))]);
  assert.equal(store.get("10")!.readAt, "2026-02-02T00:00:00.000Z");
  const sent = upserts[0].emails[0];
  for (const k of ["ingestedAt", "updatedAt", "readAt"]) assert.equal(k in sent, false);
  assert.equal(sent.text, "body");
});

test("failures are counted per url up to 3, then skipped; stored without full url", async () => {
  const bad = url("bad");
  const { rehoster, store, db } = setup([email("10", [url(1), bad])], { failing: new Set([bad]) });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await rehoster.rehostEmailImages("u1", {});
    assert.equal(r.processed, 1);
    assert.equal(r.imported, attempt === 1 ? 1 : 0);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].emailId, "10");
    assert.equal(r.failed[0].url, bad);
    assert.equal(r.remaining, attempt === 3 ? 0 : 1);
  }
  const rec = db.get(`mailbox/u1/rehostFailures/${rehostIdForUrl(bad)}`);
  assert.deepEqual(rec, { url: "cdn.example.com", error: "Fetch failed", attempts: 3, lastAt: "2026-03-01T00:00:00.000Z" });
  assert.deepEqual(store.get("10")!.mediaIds, [rehostIdForUrl(url(1))]);
  const r4 = await rehoster.rehostEmailImages("u1", {});
  assert.deepEqual({ processed: r4.processed, failed: r4.failed, remaining: r4.remaining }, { processed: 0, failed: [], remaining: 0 });
});

test("one failing url does not stop the others and concurrency is at most 3", async () => {
  const urls = Array.from({ length: 8 }, (_, i) => url(i));
  const { rehoster, store, maxInFlight } = setup([email("10", urls)], { failing: new Set([urls[1]]) });
  const r = await rehoster.rehostEmailImages("u1", {});
  assert.equal(r.imported, 7);
  assert.equal(r.failed.length, 1);
  assert.equal(store.get("10")!.mediaIds.length, 7);
  assert.ok(maxInFlight() <= 3 && maxInFlight() > 1);
});

test("explicit emailIds restricts the batch", async () => {
  const { rehoster, store } = setup([email("10", [url(1)]), email("11", [url(2)]), email("12", [url(3)])]);
  const r = await rehoster.rehostEmailImages("u1", { emailIds: ["11", "missing"] });
  assert.deepEqual({ processed: r.processed, imported: r.imported, remaining: r.remaining }, { processed: 1, imported: 1, remaining: 0 });
  assert.equal(store.get("11")!.mediaIds.length, 1);
  assert.equal(store.get("10")!.mediaIds.length, 0);
});

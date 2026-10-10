import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMediaImporter,
  isPublicAddress,
  isSafeImportUrl,
  rehostIdForUrl,
  type MediaImportDeps,
} from "./media-import";
import { MEDIA_LIMITS, MediaError, type MediaStore } from "./media-store";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const URL1 = "https://cdn.example.com/photos/Class%20Trip.png?token=abc";

function fakeStore() {
  const items = new Map<string, { meta: any; buffer: Buffer }>();
  const store = {
    async getMedia(_u: string, id: string) {
      return items.get(id) ?? null;
    },
    async putMedia(_u: string, input: any) {
      const meta = { id: input.id, filename: input.filename, mimeType: input.mimeType, size: input.buffer.length };
      items.set(input.id, { meta, buffer: input.buffer });
      return { meta, created: true };
    },
  } as unknown as MediaStore;
  return { store, items };
}

function makeImporter(opts: {
  respond?: (url: string, n: number) => Response;
  addrs?: Record<string, { address: string; family: number }[]>;
}) {
  const { store, items } = fakeStore();
  const fetched: string[] = [];
  const deps: MediaImportDeps = {
    fetch: (async (url: any, init: any) => {
      assert.equal(init.redirect, "manual");
      fetched.push(String(url));
      return opts.respond!(String(url), fetched.length);
    }) as typeof fetch,
    lookup: async (host) => opts.addrs?.[host] ?? [{ address: "93.184.216.34", family: 4 }],
    store,
  };
  return { importer: createMediaImporter(deps), fetched, items };
}

const ok = () => new Response(PNG, { status: 200 });

test("rehostIdForUrl is u + 31 hex chars, deterministic", () => {
  const id = rehostIdForUrl(URL1);
  assert.match(id, /^u[0-9a-f]{31}$/);
  assert.equal(id, rehostIdForUrl(URL1));
  assert.notEqual(id, rehostIdForUrl(URL1 + "x"));
});

test("isSafeImportUrl rejects unsafe shapes", () => {
  assert.equal(isSafeImportUrl("https://cdn.example.com/a.png"), true);
  for (const bad of [
    "http://cdn.example.com/a.png",
    "https://user:pw@cdn.example.com/a.png",
    "https://cdn.example.com:8443/a.png",
    "https://127.0.0.1/a.png",
    "https://[::1]/a.png",
    "ftp://cdn.example.com/a.png",
    "not a url",
  ]) {
    assert.equal(isSafeImportUrl(bad), false, bad);
  }
});

test("isPublicAddress blocks each private class", () => {
  for (const a of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "100.127.255.255", "0.0.0.0", "224.0.0.1",
  ]) {
    assert.equal(isPublicAddress(a, 4), false, a);
  }
  for (const a of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::ffff:192.168.0.1"]) {
    assert.equal(isPublicAddress(a, 6), false, a);
  }
  assert.equal(isPublicAddress("93.184.216.34", 4), true);
  assert.equal(isPublicAddress("172.32.0.1", 4), true);
  assert.equal(isPublicAddress("100.128.0.1", 4), true);
  assert.equal(isPublicAddress("2606:2800:220:1::1", 6), true);
  assert.equal(isPublicAddress("::ffff:8.8.8.8", 6), true);
});

test("successful import stores sniffed type and default filename", async () => {
  const { importer, fetched, items } = makeImporter({ respond: ok });
  const res = await importer.importFromUrl("u1", { url: URL1, tags: ["school"] });
  assert.equal(res.created, true);
  assert.equal(res.fetched, true);
  assert.equal(fetched.length, 1);
  const stored = items.get(rehostIdForUrl(URL1))!;
  assert.equal(stored.meta.mimeType, "image/png");
  assert.equal(stored.meta.filename, "Class Trip.png");
});

test("filename defaults to 'image' and caller filename wins", async () => {
  const a = makeImporter({ respond: ok });
  const r1 = await a.importer.importFromUrl("u1", { url: "https://cdn.example.com/" });
  assert.equal(r1.meta.filename, "image");
  const r2 = await a.importer.importFromUrl("u1", { url: URL1, filename: "mine.png" });
  assert.equal(r2.meta.filename, "mine.png");
});

test("repeat import dedupes without fetching", async () => {
  const { importer, fetched } = makeImporter({ respond: ok });
  await importer.importFromUrl("u1", { url: URL1 });
  const again = await importer.importFromUrl("u1", { url: URL1 });
  assert.equal(again.fetched, false);
  assert.equal(again.created, false);
  assert.equal(fetched.length, 1);
});

test("blocked resolved addresses are rejected before fetch", async () => {
  for (const [address, family] of [
    ["127.0.0.1", 4], ["10.0.0.5", 4], ["172.20.0.1", 4], ["192.168.0.9", 4], ["169.254.169.254", 4],
    ["100.64.1.1", 4], ["0.1.2.3", 4], ["224.0.0.5", 4], ["::1", 6], ["fc00::5", 6], ["fe80::5", 6], ["::ffff:10.0.0.1", 6],
  ] as const) {
    const { importer, fetched } = makeImporter({
      respond: ok,
      addrs: { "cdn.example.com": [{ address: "93.184.216.34", family: 4 }, { address, family }] },
    });
    await assert.rejects(importer.importFromUrl("u1", { url: URL1 }), (e: any) => e instanceof MediaError && e.status === 400);
    assert.equal(fetched.length, 0, address);
  }
});

test("redirect to a private host is blocked; public redirects are followed up to 3", async () => {
  const priv = makeImporter({
    respond: () => new Response(null, { status: 302, headers: { location: "https://internal.example.net/x.png" } }),
    addrs: { "internal.example.net": [{ address: "10.0.0.2", family: 4 }] },
  });
  await assert.rejects(priv.importer.importFromUrl("u1", { url: URL1 }), (e: any) => e instanceof MediaError && e.status === 400);
  assert.equal(priv.fetched.length, 1);

  const scheme = makeImporter({
    respond: () => new Response(null, { status: 302, headers: { location: "http://cdn.example.com/x.png" } }),
  });
  await assert.rejects(scheme.importer.importFromUrl("u1", { url: URL1 }), MediaError);

  const chain = makeImporter({
    respond: (_u, n) =>
      n <= 3 ? new Response(null, { status: 301, headers: { location: `/hop${n}.png` } }) : ok(),
  });
  const res = await chain.importer.importFromUrl("u1", { url: URL1 });
  assert.equal(res.fetched, true);
  assert.equal(chain.fetched.length, 4);

  const loop = makeImporter({
    respond: () => new Response(null, { status: 301, headers: { location: "/again.png" } }),
  });
  await assert.rejects(loop.importer.importFromUrl("u1", { url: URL1 }), (e: any) => e instanceof MediaError && e.status === 502);
  assert.equal(loop.fetched.length, 4);
});

test("body over the size cap is rejected with 413", async () => {
  const big = new Uint8Array(MEDIA_LIMITS.fileBytesMax + 1);
  const { importer } = makeImporter({ respond: () => new Response(big, { status: 200 }) });
  await assert.rejects(importer.importFromUrl("u1", { url: URL1 }), (e: any) => e instanceof MediaError && e.status === 413);
});

test("non-image body is rejected with 415; non-2xx with 502", async () => {
  const html = makeImporter({ respond: () => new Response("<html>nope</html>", { status: 200 }) });
  await assert.rejects(html.importer.importFromUrl("u1", { url: URL1 }), (e: any) => e instanceof MediaError && e.status === 415);
  const gone = makeImporter({ respond: () => new Response("x", { status: 404 }) });
  await assert.rejects(
    gone.importer.importFromUrl("u1", { url: URL1 }),
    (e: any) => e instanceof MediaError && e.status === 502 && e.message === "Upstream status 404",
  );
});

test("unsafe url is rejected without lookup or fetch", async () => {
  const { importer, fetched } = makeImporter({ respond: ok });
  await assert.rejects(importer.importFromUrl("u1", { url: "http://cdn.example.com/a.png" }), MediaError);
  assert.equal(fetched.length, 0);
});

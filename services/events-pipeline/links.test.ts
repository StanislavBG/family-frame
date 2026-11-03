import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createLinkChecker } from "./links";

let server: http.Server;
let port = 0;
let closedPort = 0;
let hits: string[] = [];
let flaky = 0;

before(async () => {
  server = http.createServer((req, res) => {
    const host = String(req.headers.host ?? "");
    hits.push(`${host}${req.url}`);
    const u = req.url ?? "/";
    const orig = req.headers["x-orig-host"];
    if (u === "/404") return void res.writeHead(404).end();
    if (u === "/410") return void res.writeHead(410).end();
    if (u === "/403") return void res.writeHead(403).end();
    if (u === "/ok") return void res.writeHead(200).end("hi");
    if (u === "/cross") return void res.writeHead(302, { location: "https://other.test/page" }).end();
    if (u === "/deep/page") return void res.writeHead(301, { location: "/" }).end();
    if (u === "/same") return void res.writeHead(302, { location: "/ok" }).end();
    if (u === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
    if (u === "/flaky") {
      flaky++;
      return void res.writeHead(flaky === 1 ? 503 : 200).end();
    }
    if (u === "/down") return void res.writeHead(503).end();
    res.writeHead(200).end(String(orig ?? ""));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  const tmp = http.createServer();
  await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
  closedPort = (tmp.address() as AddressInfo).port;
  await new Promise<void>((r) => tmp.close(() => r()));
});

after(() => new Promise<void>((r) => server.close(() => r())));

const shim: typeof fetch = (input, init) => {
  const u = new URL(String(input));
  const p = u.hostname === "refused.test" ? closedPort : port;
  return fetch(`http://127.0.0.1:${p}${u.pathname}${u.search}`, { ...init, redirect: "manual" });
};

const lookup = async (host: string) => {
  if (host === "private.test") return [{ address: "10.0.0.1", family: 4 }];
  if (host === "cgnat.test") return [{ address: "100.64.0.1", family: 4 }];
  if (host === "nxdomain.test") throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
  return [{ address: "93.184.216.34", family: 4 }];
};

function make() {
  hits = [];
  return createLinkChecker({ fetch: shim, lookup, timeoutMs: 3000, retryDelayMs: 10 } as never);
}

test("404 and 410 are dead", async () => {
  const c = make();
  assert.equal((await c.check("https://a.test/404")).status, "dead");
  const r = await c.check("https://a.test/410");
  assert.equal(r.status, "dead");
  assert.equal(r.httpStatus, 410);
});

test("refused connection and DNS failure are dead", async () => {
  const c = make();
  assert.equal((await c.check("https://refused.test/ok")).status, "dead");
  assert.equal((await c.check("https://nxdomain.test/ok")).status, "dead");
});

test("cross-domain redirect and deep link to root are moved", async () => {
  const c = make();
  assert.equal((await c.check("https://a.test/cross")).status, "moved");
  assert.equal((await c.check("https://a.test/deep/page")).status, "moved");
});

test("403 is blocked", async () => {
  assert.equal((await make().check("https://a.test/403")).status, "blocked");
});

test("same-site redirect to 200 is ok", async () => {
  const r = await make().check("https://a.test/same");
  assert.equal(r.status, "ok");
  assert.equal(r.finalUrl, "https://a.test/ok");
});

test("503 then 200 is ok; 503 twice is dead", async () => {
  flaky = 0;
  const c = make();
  assert.equal((await c.check("https://a.test/flaky")).status, "ok");
  assert.equal((await c.check("https://a.test/down")).status, "dead");
});

test("redirect loop is dead", async () => {
  assert.equal((await make().check("https://a.test/loop")).status, "dead");
});

test("unsafe or non-public targets are refused with no request", async () => {
  const c = make();
  for (const u of [
    "http://a.test/ok",
    "https://private.test/ok",
    "https://cgnat.test/ok",
    "https://127.0.0.1/ok",
    "https://a.test:8443/ok",
    "https://user:pw@a.test/ok",
  ]) {
    assert.equal((await c.check(u)).status, "refused", u);
  }
  assert.equal(hits.length, 0);
});

test("one URL is fetched once per checker", async () => {
  const c = make();
  const [a, b] = await Promise.all([c.check("https://a.test/ok"), c.check("https://a.test/ok")]);
  await c.check("https://a.test/ok");
  assert.equal(a.status, "ok");
  assert.deepEqual(a, b);
  assert.equal(hits.length, 1);
  assert.equal(c.stats().ok, 1);
});

test("concurrency is limited", async () => {
  let inflight = 0;
  let peak = 0;
  const slow: typeof fetch = async () => {
    inflight++;
    peak = Math.max(peak, inflight);
    await new Promise((r) => setTimeout(r, 20));
    inflight--;
    return new Response(null, { status: 200 });
  };
  const c = createLinkChecker({ fetch: slow, lookup, concurrency: 2 });
  await Promise.all([1, 2, 3, 4, 5, 6].map((i) => c.check(`https://a.test/${i}`)));
  assert.equal(peak, 2);
});

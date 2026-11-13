import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadMarket, marketSymbolLoader, resetMarketCacheForTests, MARKET_CACHE_TTL_MS } from "./apps/stocks";

const realFetch = globalThis.fetch;
const START = Date.UTC(2026, 10, 12, 12, 0, 0);
let calls: string[] = [];
let failNext = 0;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function upstream(url: string): Response {
  if (url.includes("simple/price")) return jsonResponse({ bitcoin: { usd: 50_000, usd_24h_change: 2 } });
  if (url.includes("market_chart")) {
    const day = 24 * 60 * 60 * 1000;
    return jsonResponse({ prices: [[START - 365 * day, 25_000], [START - day, 49_000], [START, 50_000]] });
  }
  const sec = Math.floor(START / 1000);
  return jsonResponse({
    chart: { result: [{
      meta: { regularMarketPrice: 40_000, previousClose: 39_000 },
      timestamp: [sec - 365 * 86400, sec],
      indicators: { quote: [{ close: [30_000, 40_000] }] },
    }] },
  });
}

beforeEach(() => {
  calls = [];
  failNext = 0;
  resetMarketCacheForTests();
  mock.timers.enable({ apis: ["Date"], now: START });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (failNext > 0) {
      failNext--;
      throw new Error("network down");
    }
    return upstream(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  resetMarketCacheForTests();
});

test("5 calls within 60 s fetch upstream only once per symbol", async () => {
  const first = await loadMarket(["DJI", "BTC"]);
  assert.equal(calls.length, 3); // Yahoo DJI + CoinGecko price + chart
  assert.equal(first.dji?.price, 40_000);
  assert.equal(first.dji?.change1Y, ((40_000 - 30_000) / 30_000) * 100);
  assert.equal(first.btc?.price, 50_000);
  assert.equal(first.btc?.change1Y, 100);
  for (let i = 0; i < 4; i++) {
    mock.timers.tick(10_000);
    const again = await loadMarket(["DJI", "BTC"]);
    assert.deepEqual(again, first);
  }
  assert.equal(calls.length, 3);
});

test("after the TTL passes the next call fetches again", async () => {
  await loadMarket(["DJI", "BTC"]);
  assert.equal(calls.length, 3);
  mock.timers.tick(MARKET_CACHE_TTL_MS + 1);
  await loadMarket(["DJI", "BTC"]);
  assert.equal(calls.length, 6);
});

test("concurrent calls share one in-flight fetch", async () => {
  const [a, b] = await Promise.all([loadMarket(["DJI"]), loadMarket(["DJI"])]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
  assert.strictEqual(marketSymbolLoader("DJI"), marketSymbolLoader("DJI"));
});

test("a failed fetch is not cached and is retried on the next call", async () => {
  failNext = 1;
  const failed = await loadMarket(["DJI"]);
  assert.deepEqual(failed, { dji: null });
  assert.equal(calls.length, 1);
  const ok = await loadMarket(["DJI"]);
  assert.equal(calls.length, 2);
  assert.equal(ok.dji?.price, 40_000);
});

test("unknown symbols are skipped and never cached", async () => {
  const result = await loadMarket(["NOPE"]);
  assert.deepEqual(result, {});
  assert.equal(calls.length, 0);
  assert.notStrictEqual(marketSymbolLoader("NOPE"), marketSymbolLoader("NOPE"));
});

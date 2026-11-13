import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { geocodeCity, getWeather, reverseGeocode } from "./weather";

const realFetch = globalThis.fetch;
const realError = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

// A fetch that never responds; it only settles (rejects) when its signal aborts.
function stubHangingFetch(): { signals: (AbortSignal | undefined)[] } {
  const signals: (AbortSignal | undefined)[] = [];
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }) as typeof fetch;
  console.error = () => {};
  return { signals };
}

// Fails the test if the call hangs instead of settling within the guard.
async function settlesWithin<T>(p: Promise<T>, ms = 2000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_r, reject) => {
    timer = setTimeout(() => reject(new Error("call hung past upstream timeout")), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer);
  }
}

test("getWeather returns null when the forecast upstream times out", async () => {
  const { signals } = stubHangingFetch();
  const result = await settlesWithin(getWeather(47.6, -122.3, 20));
  assert.equal(result, null);
  assert.equal(signals.length, 1);
  assert.ok(signals[0] instanceof AbortSignal, "fetch got an abort signal");
});

test("geocodeCity returns null when the geocoding upstream times out", async () => {
  const { signals } = stubHangingFetch();
  const result = await settlesWithin(geocodeCity("Seattle", "US", 20));
  assert.equal(result, null);
  assert.ok(signals[0] instanceof AbortSignal);
});

test("reverseGeocode returns Unknown when Nominatim times out", async () => {
  const { signals } = stubHangingFetch();
  const result = await settlesWithin(reverseGeocode(47.6, -122.3, 20));
  assert.deepEqual(result, { city: "Unknown", country: "Unknown" });
  assert.ok(signals[0] instanceof AbortSignal);
});

test("default timeout is FETCH_TIMEOUT_MS: every call passes a signal", async () => {
  const { signals } = stubHangingFetch();
  // Don't await: the default 10 s timeout would slow the suite; just check the signal is wired.
  void getWeather(1, 2);
  void geocodeCity("x");
  void reverseGeocode(1, 2);
  assert.equal(signals.length, 3);
  for (const s of signals) {
    assert.ok(s instanceof AbortSignal);
    assert.equal(s.aborted, false);
  }
});

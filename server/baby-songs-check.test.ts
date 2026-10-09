import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_MOOD_STATIONS } from "@shared/schema";
import { checkAudioUrl, checkYouTubeVideo, collectBabySongSources } from "./baby-songs-check";

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: any, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const audio = (status: number, type = "audio/mpeg") =>
  new Response(null, { status, headers: { "content-type": type } });

const fast = { retries: 2, delayMs: 0 };

test("audio 206 is ok and sends Range header", async () => {
  const { fetchImpl, calls } = fakeFetch([audio(206)]);
  const r = await checkAudioUrl("https://archive.org/a.mp3", { ...fast, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.status, 206);
  assert.equal(r.attempts, 1);
  assert.deepEqual(calls[0].init?.headers, { Range: "bytes=0-1023" });
  assert.equal(calls[0].init?.redirect, "follow");
});

test("audio 404 is dead without retry", async () => {
  const { fetchImpl, calls } = fakeFetch([audio(404, "text/html")]);
  const r = await checkAudioUrl("https://archive.org/a.mp3", { ...fast, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(calls.length, 1);
});

test("audio 200 text/html is dead", async () => {
  const { fetchImpl } = fakeFetch([audio(200, "text/html")]);
  const r = await checkAudioUrl("https://archive.org/a.mp3", { ...fast, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 200);
  assert.match(r.reason ?? "", /content-type/);
});

test("5xx then 206 retry succeeds", async () => {
  const { fetchImpl } = fakeFetch([audio(503, "text/html"), audio(206)]);
  const r = await checkAudioUrl("https://archive.org/a.mp3", { ...fast, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
});

test("retries exhausted returns ok=false and never throws", async () => {
  const { fetchImpl, calls } = fakeFetch([
    new Error("boom"),
    audio(429, "text/html"),
    audio(500, "text/html"),
  ]);
  const r = await checkAudioUrl("https://archive.org/a.mp3", { ...fast, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 3);
  assert.equal(calls.length, 3);
  assert.match(r.reason ?? "", /500/);
});

test("youtube 200 returns title", async () => {
  const { fetchImpl, calls } = fakeFetch([
    new Response(JSON.stringify({ title: "Baby Shark" }), { status: 200 }),
  ]);
  const r = await checkYouTubeVideo("abc123", { ...fast, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.title, "Baby Shark");
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, "https://www.youtube.com/oembed");
  assert.equal(u.searchParams.get("url"), "https://www.youtube.com/watch?v=abc123");
  assert.equal(u.searchParams.get("format"), "json");
});

test("youtube 401/403 is embedding disabled", async () => {
  for (const status of [401, 403]) {
    const { fetchImpl } = fakeFetch([new Response(null, { status })]);
    const r = await checkYouTubeVideo("abc123", { ...fast, fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "embedding disabled");
  }
});

test("youtube 400/404 is unavailable", async () => {
  for (const status of [400, 404]) {
    const { fetchImpl } = fakeFetch([new Response(null, { status })]);
    const r = await checkYouTubeVideo("abc123", { ...fast, fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "unavailable");
  }
});

test("collectBabySongSources de-duplicates shared videoIds", () => {
  const { audio: tracks, youtube } = collectBabySongSources();
  assert.ok(tracks.length > 0);
  const ids = youtube.map((y) => y.videoId);
  assert.equal(new Set(ids).size, ids.length);

  const counts = new Map<string, Set<string>>();
  for (const s of BUILT_IN_MOOD_STATIONS)
    for (const v of s.videoIds) counts.set(v, (counts.get(v) ?? new Set()).add(s.id));
  for (const y of youtube) assert.deepEqual([...y.stations].sort(), [...counts.get(y.videoId)!].sort());
});

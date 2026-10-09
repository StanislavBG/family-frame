# Validation: baby-songs-source-checker, baby-songs-validate-cli

Base: 35d334ac (commits found: 24fca0d checker, b65849c CLI; 74dd9ec/2036337 are unrelated TV/radio work and out of scope).
Gate re-run (`npm run check`, `npm test`): tsc clean; vitest + server tests 86/86 pass.

## baby-songs-source-checker — VERIFIED
- collectBabySongSources: server/baby-songs-check.ts:26-38 builds from BABY_RADIO_LIBRARY / BUILT_IN_MOOD_STATIONS, Map-dedupes by videoId, collects station ids.
- checkAudioUrl: :88-105 GET with `Range: bytes=0-1023` (:89), redirect follow + `AbortSignal.timeout` (:67-68, 15 s default :56), ok only for 200/206 with `audio/` content-type.
- checkYouTubeVideo: :107-130 oEmbed via URLSearchParams; 200 → title; 401/403 "embedding disabled"; 400/404 "unavailable".
- Retries: :51-81 retries only on network error/429/5xx, default 2 / 1000 ms, catches all errors, returns ok=false with last status/error.
- Tests: server/baby-songs-check.test.ts has 9 tests (lines 23-100) covering every listed case with injected fake fetch; no real network.
- Gate: pass (above).

## baby-songs-validate-cli — VERIFIED
- script/validate-baby-songs.ts:10-21 inline pool, CONCURRENCY = 4 (note: audio then YouTube run sequentially, never >4 in flight); imports from ../server/baby-songs-check.
- Per-source OK/DEAD lines plus summary `audio: x/y ok, youtube: x/y ok` (:53-60). Observed: `audio: 25/33 ok, youtube: 17/28 ok`.
- Exit code: `process.exitCode = dead > 0 ? 1 : 0` (:63); `HALT: <message>` + exit 1 in catch (:66-69). Observed exit 1 (expected: dead sources).
- `--json` branch prints `{audio, youtube, summary}` (:49-51); not executed separately (same code path/network).
- package.json:11 adds `validate:baby-songs`; not in `npm test`.
- Gate: pass.

## Findings
Critical: none.
Important: none.
Minor:
- script/validate-baby-songs.ts:49 `--json` output not covered by an automated test (needs network); verified by reading only.
- No `Base:`-relative scope issue: base range also contains unrelated TV/radio commits; ignored.

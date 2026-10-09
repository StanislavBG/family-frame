# Validation: baby-songs-remove-dead-sources

Base: b65849c. PRD file: prds-archived/62-baby-songs-remove-dead-sources.md. Landing commit: ddc0d65 (touches only shared/schema.ts and server/baby-songs-check.test.ts for this PRD).

## baby-songs-remove-dead-sources — VERIFIED

- AC1 (tracks): diff removes as003..as010 lines from BABY_RADIO_LIBRARY; as001/as002 remain at shared/schema.ts:890-891; nr*/cs* untouched in diff.
- AC2 (video IDs): diff removes all 11 dead IDs and their inline comments from BUILT_IN_MOOD_STATIONS.
- AC3 (stations): lullabies-yt and cocomelon objects deleted. Remaining: kids-hits (10 KPOPDH IDs), bathtime-yt (2), party-yt (4), nature-yt (2) — all >= 2.
- AC4 (test): server/baby-songs-check.test.ts:112-126 adds "built-in Baby Songs sources exclude known-dead entries" with the 8 track and 11 video IDs and the >= 2 check.
- AC5 (refs): `grep -rniE "lullabies-yt|cocomelon" client server shared` -> clean. ContentType.ANIMAL_SOUNDS kept (shared/schema.ts:646, 660, 890).
- AC6 / Gate: `npm ci` was needed (no node_modules in worktree); `timeout 300 npm run check` exit 0; `npm test` exit 0, 87 tests pass, 0 fail.
- Not run: `validate-baby-songs.ts` live network smoke check (informational only).

## Findings

Critical: none.
Important: none.
Minor:
- `git diff b65849c..HEAD` also contains unrelated commits (RadioFAB removal, TV channel UI, other review records); they belong to other plans and were not reviewed here.
- Header comment changed to "(check with npm run validate:baby-songs)" as the PRD specified; no secrets, input handling or path issues in the diff (static data + test only).

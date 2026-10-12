# Validation: release macro (PRDs 234, 235, 236)

Base: 6eb4c1fc0b94c7ebf395c334cc1d87c0031e0ec8. Commits: 131e199 (234), 60465f0 (235), 8eadf4f (236). PRD files found in `prds-archived/`.

## 234 release-plan-primitive — VERIFIED
- Exports `BranchFacts`, `ReleasePlan`, `planRelease`, `epicIdOf`, `parseValidationVerdict`: `script/release-plan.ts:1-65`.
- `ahead===0` -> ignore (`:49`); non-Epic not included -> skip with exact reason (`:53`); never-merge names -> skip `never merged automatically` even if included (`:51`, check precedes include).
- Hold order dirty / openPrds / refuted with exact reasons (`:55-60`); include bypasses only the Epic-name check; merge sorted by `oldestCommitTime` (`:65`).
- Pure: no fs/child_process imports.
- Gate: `npx tsx --test script/release-plan.test.ts` -> 9 pass, 0 fail. `npm run check` (main checkout) exit 0.

## 235 release-script — VERIFIED
- `package.json`: `"release": "tsx script/release.ts"`; `test` now ends `tsx --test server/*.test.ts script/*.test.ts`.
- Main checkout = first `worktree` line of porcelain list (`script/release.ts:55-70`); exits 1 on dirty tracked main / diverged origin (`:140-160`).
- Dry run: prints merge/hold/skip plus `main..branch` commit lists, returns before fetch/worktree/push (`:176-197`).
- Real run: fetch, ff main, temp worktree on `release/<ts>` under tmpdir with node_modules symlink, `merge --no-ff --no-edit`, `merge --abort` and hold on conflict (`:199-230`); "Nothing to publish" path; gate check then test, red -> exit 1 no push; green -> `merge --ff-only` (or `fetch . rel:main`), then `git push origin main`; Markdown summary. finally-block removes only the tmp worktree and `release/<ts>` branch (`:244-258`).
- Not executed: real-run path (forbidden by task); verified by reading only.
- Gate: `npm run check` exit 0; `npm test` 395 pass / 0 fail (run in main checkout, same commit as HEAD, since the job worktree has no node_modules); `npm run release -- --dry-run` exit 0.
- Dry-run no-change check: `git rev-parse main`, `git worktree list`, `git branch`, tracked status hashed before and after both runs — identical. Run from main checkout: exit 0. Run from job worktree (node_modules/.bin borrowed via PATH): exit 0, still reported `Main checkout: /home/bilko/Projects/family-frame`.
- Extra review points: no `--force` on push or merge (only `worktree remove --force` on its own tmp path, `:249`); no branch/worktree deleted other than its own; all git/npm calls use `execFileSync`/`spawnSync` arg arrays, no shell strings; push (`:221`) occurs only after `runGate` returned ok.

## 236 release-builder-overlay — VERIFIED
- `.claude/agents/builder.md`: frontmatter name/description/tools correct; says it overlays `~/.claude/agents/builder.md`.
- Covers no registry/tags, "published" meaning, `npm run release` from `/home/bilko/Projects/family-frame` with `--dry-run` / `--include`, Replit human step, four hold rules with "do not force", never-list (force-push, rebase others, delete branches/worktrees, push on red), 4-step manual fallback.
- `CLAUDE.md`: `## Release` section after `## Deployment`; Deployment Release bullet points to it.
- Only `.claude/agents/builder.md` added under `.claude/` (`git diff --stat`: 6 files, none is `.claude/settings.json`).

## Findings

### Critical
- none

### Important
- none

### Minor
- `script/release.ts:208-215`: any failing `git merge` is reported as `merge conflict` and aborted; a non-conflict failure (e.g. unrelated histories) would be mislabelled.
- `script/release.ts:172`: a dirty main checkout fails only when it is on `main`; fine for the ff path, but the dry-run also exits 1 in that case rather than just warning.
- `script/release.ts:9-13`: `--include` as the last arg with no value is silently ignored.
- `script/release.ts:130-140`: dry run skips `git fetch`, so the plan can be computed against a stale `origin/main`.
- `script/release.ts:117-130`: gate output is buffered and only the last 10 lines shown on success; long gates give no progress.
- Real-run path (merge, gate, ff, push, cleanup) has no automated test; only the pure planner is tested.
- `npm run check`/`npm test` cannot run in a fresh job worktree (no node_modules); run from the main checkout instead.

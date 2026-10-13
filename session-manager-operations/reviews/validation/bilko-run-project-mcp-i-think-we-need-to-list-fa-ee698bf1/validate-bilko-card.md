# Validation: bilko.run project card (PRDs 272, 273, 274)

Base: 915fb3b (known). Commits: d76cd35, d8bbd61 (272); 36cc423 (273); 1682248 (274). `npm ci` was run first because the job worktree had no node_modules.

## 272-bilko-redirect-bundle — VERIFIED
- Exports `BILKO_SLUG`, `renderRedirectPage`, `buildManifest`, `buildBilkoBundle`: script/bilko-bundle.ts:7,25,57,78. Page has lang/charset/viewport/title/refresh/canonical/h1/link (:40-56); https-only check via `new URL` (:30-35); attr-escape (:15-23). No script, no og/twitter: `grep -ci '<script' bilko-dist/index.html` → 0.
- Manifest shape matches spec (schemaVersion 1, slug, hostKit 0.0.0, golden, health {}, bundle sizeBytesGz/fileCount): printed manifest.json (268 B gz, 1 file); <16 KB guard at :88.
- `npm run bilko:build` → `bilko-bundle: family-frame 1.0.0 (1682248) -> https://family-frame.replit.app/`, exit 0; index.html redirects to https://family-frame.replit.app/.
- package.json `bilko:build` script present; .gitignore has `bilko-dist/`.
- script/bilko-bundle.test.ts covers all listed cases.
- Gate: `npm test` exit 0 (469 pass, 0 fail); `npm run check` exit 0; `npm run bilko:build` exit 0.

## 273-bilko-golden-spec — VERIFIED
- `@playwright/test ^1.60.0` is the only devDependency added (package.json diff); package-lock.json updated.
- playwright.config.ts: testDir ./tests, single chromium project, no webServer.
- tests/golden.spec.ts: test 1 builds the bundle, stubs the host with page.route, opens via file://, `waitForURL` (:23-30). Test 2 strips the refresh meta, asserts h1 and link href (:32-38).
- `pnpm exec playwright test tests/golden.spec.ts --reporter=line` → 2 passed, exit 0. `npx playwright test ...` also passes. npm test and npm run check pass (above).

## 274-bilko-listing-and-docs — VERIFIED
- bilko.listing.json is valid JSON and matches the notes. Limits checked by script: tagline 92/160, 3 tags ≤24, detail 213/400, audience 86/200, 4 talkingPoints ≤200, callToAction 50/120, 4 avoidClaims ≤200, file <16 KB. Node parse gate exit 0.
- docs/bilko-run.md covers slug binding, redirect bundle + `npm run bilko:build`, the exact publish call (slug, distPath, sourceRepoPath, bypass `audit` with the stated reason), publish from main after `npm run release`, card edits via listing file or `update_project_listing`, owner decides public visibility, a11y bypass note, `npm install` for playwright.
- CLAUDE.md: Deployment line (CLAUDE.md:390) and Project Structure entries for bilko.listing.json and script/bilko-bundle.ts present.

## Findings
### Critical
- none
### Important
- none
### Minor
- script/bilko-bundle.ts:80 — `path.resolve("package.json")` is cwd-relative; running the builder from another directory fails or reads the wrong file. Fine for `npm run` and the golden gate (repo root).
- script/bilko-bundle.ts:57 — `ManifestInput.files[].name` is unused by `buildManifest`; harmless.
- Security/self-review (code-review tooling not run separately): target is URL-validated and attribute-escaped; no secrets; `rmSync(outDir)` only on caller-supplied dir (default bilko-dist); git invoked via execFileSync with fixed args. No issues.

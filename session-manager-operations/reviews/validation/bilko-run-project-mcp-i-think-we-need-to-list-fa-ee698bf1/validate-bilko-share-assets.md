# Validation: bilko-og-image, bilko-bundle-share-assets

Base: 1682248 (commits 2986168, 3842f2c). Gates re-run in the foreground in this worktree (node_modules symlinked from the main checkout, untracked).

## bilko-og-image: VERIFIED
- `renderOgHtml(iconDataUri, fontDataUri?)` exported, direct-run guard, chromium via `@playwright/test`, viewport 1200x630, `page.setContent`, clip screenshot to `bilko/og.png`, logs bytes: `script/bilko-og.ts:10,60-78`. Run output: `bilko-og: bilko/og.png 36633 bytes`.
- Palette #FDF8F2 / #C05746 / #82937A / #F4D06F, 104px serif title, tagline, Photos/Calendar/Messages/Weather chips, favicon as data URI, font inlined from node_modules (woff2 data URI): `script/bilko-og.ts:28-45`. No network resources.
- `bilko/og.png` IHDR 1200x630, 36633 bytes (<= 153600). Regeneration is byte-identical (no git diff).
- Opened og.png: title, tagline and chips are legible, nothing clipped, on-brand.
- `package.json` has `"bilko:og": "tsx script/bilko-og.ts"`; `npm run check` exit 0.
- Gate (og, size check, check): exit 0.

## bilko-bundle-share-assets: VERIFIED
- `buildBilkoBundle` writes index.html, og.png, icon.png, manifest.json; manifest covers the first three; missing source throws `bilko-bundle: missing <path>`; paths resolved from module location: `script/bilko-bundle.ts:10-21,91-115`.
- `bilko.listing.json` adds only `icon` and `shareImage` with the specified paths (diff).
- `script/bilko-bundle.test.ts` covers four files, og 1200x630 <= 5 MB, icon square 128-1024 <= 512 KB, total gzip < 204800, manifest counts; `pngSize` exported.
- `docs/bilko-run.md` section 5 "Share image" present (bilko:og, favicon source, https://bilko.run/og/family-frame.png).
- Gate: `npm test` 469 pass / 0 fail; `npm run check` 0; `npm run bilko:build` 0; playwright golden 2 passed.
- `bilko-dist`: icon.png (1145 B), index.html, manifest.json, og.png (36633 B); gzip total 35150 B (< 200 KB).

## Findings
### Critical
- none
### Important
- none
### Minor
- `bilko/og.png`: the favicon icon renders orange, off the Hearth & Heritage palette; it is the real app icon so it matches the PRD, but is visually the only off-palette element.
- Self-review of the diff (no new dependencies, no network fetches, fixed repo-relative paths, no secrets) found no path-traversal or input-handling issues.

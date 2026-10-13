# bilko.run project card

How to rebuild and publish the Family Frame card on bilko.run. The card is a redirect to the hosted app; it does not host Family Frame itself.

## 1. What the card is

- Slug `family-frame` is a static-path entry bound to `/home/bilko/Projects/family-frame`.
- The bundle is a redirect to `https://family-frame.replit.app/`, built by `npm run bilko:build` into `bilko-dist/` (git-ignored).
- Card copy (tagline, tags, listing details) lives in `bilko.listing.json` at the repo root and is synced into the bilko.run registry on every publish.

## 2. Rebuild

```bash
npm run bilko:build
```

## 3. Publish

Publish only from the main checkout, after `npm run release` has put the work on `main`. Run `npm install` there after the release pull: the golden gate runs `tests/golden.spec.ts` via `pnpm exec playwright test` in the main checkout, so `@playwright/test` must be installed.

Call the bilko-host MCP tool `publish_static_project`:

| Argument | Value |
| --- | --- |
| `slug` | `family-frame` |
| `distPath` | `/home/bilko/Projects/family-frame/bilko-dist` |
| `sourceRepoPath` | `/home/bilko/Projects/family-frame` |
| bypass | `audit` |

Bypass reason for `audit`: "Family Frame is an npm project (no pnpm-lock.yaml), so pnpm audit cannot run; the redirect bundle ships no dependencies".

The a11y gate needs a bypass only if its scan follows the redirect off-site. If you bypass it, record the reason in the publish call.

## 4. Editing the card

- Edit `bilko.listing.json` and publish again (synced on publish), or
- call `update_project_listing` for a change without republishing.

Host limits: tagline <= 160 chars, <= 6 tags (each <= 24), detail <= 400, audience <= 200, <= 5 talking points (each <= 200), callToAction <= 120, <= 5 avoidClaims (each <= 200), file < 16 KB.

## 5. Visibility

Making the card public on `/projects` is the Bilko owner's decision, not part of publishing.

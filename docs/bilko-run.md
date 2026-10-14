# bilko.run project card

How the Family Frame card on bilko.run works and how to edit it. The card links to the hosted app; bilko.run does not host Family Frame.

## 1. What the card is

- Slug `family-frame` is an `external-url` entry in the Bilko registry, bound to `/home/bilko/Projects/family-frame`.
- Its `url` is `https://family-frame.replit.app`. The card on https://bilko.run/projects opens it directly.
- There is no bundle to build. Do not call `publish_static_project` for `family-frame`; Bilko refuses it for external-url slugs.
- Card copy (tagline, tags, listing details) lives in `bilko.listing.json` at the repo root.

## 2. Editing the card

Edit `bilko.listing.json`, then call the bilko-host MCP tool `update_project_listing`:

| Argument | Value |
| --- | --- |
| `slug` | `family-frame` |
| `callerRepoPath` | `/home/bilko/Projects/family-frame` |
| `patch` | the changed fields from `bilko.listing.json` |

- Changing the card's `url` works the same way (`patch: { "url": "https://..." }`).
- `bilko.listing.json` has no `icon` or `shareImage`: both must be PNGs inside a published bundle, which an external-url entry does not have. bilko.run generates the share card (https://bilko.run/og/family-frame.png).

Host limits: tagline <= 160 chars, <= 6 tags (each <= 24), detail <= 400, audience <= 200, <= 5 talking points (each <= 200), callToAction <= 120, <= 5 avoidClaims (each <= 200), file < 16 KB.

## 3. Visibility

Whether the card is public on `/projects` is the Bilko owner's decision, not this repo's.

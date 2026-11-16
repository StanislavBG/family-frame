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
- `bilko.listing.json` has no `icon`, `shareImage` or `video`: each must be a file inside a published bundle, which an external-url entry does not have yet (see section 3). bilko.run generates the share card (https://bilko.run/og/family-frame.png).

## 3. Card video and poster (waiting on Bilko)

`bilko-card/` holds the card media, ready for when bilko.run can host files for an external-url entry:

| File | What it is | Host limit |
| --- | --- | --- |
| `bilko-card/tile.mp4` | The 60 s demo video (Project Home video `vid-mwi5j7ogfq5`), H.264 + AAC, 1200x630, faststart, 6.5 MB | `listing.video`: MP4 with `ftyp`, <= 8 MB |
| `bilko-card/og.png` | Its closing frame (name, "Free / Passion project / Early testers welcome", URL) | `listing.shareImage`: 1200x630 PNG, <= 5 MB |

- Both were rendered from the demo's HTML by seeking `window.smDemo` frame by frame at 30 fps in headless Chromium (1200x675 viewport, rows 10-639 kept), with the embedded MP3 as the soundtrack.
- Today `publish_static_project` refuses external-url slugs, so the files cannot reach `/projects/family-frame/`. Do not set `listing.video` or `listing.shareImage` until Bilko hosts the files: the card would request a missing file.
- Once Bilko can host them, publish the two files to `/projects/family-frame/` and patch the listing: `{ "listing": { "video": "/projects/family-frame/tile.mp4", "shareImage": "/projects/family-frame/og.png" } }`.

Host limits: tagline <= 160 chars, <= 6 tags (each <= 24), detail <= 400, audience <= 200, <= 5 talking points (each <= 200), callToAction <= 120, <= 5 avoidClaims (each <= 200), file < 16 KB.

## 4. Visibility

Whether the card is public on `/projects` is the Bilko owner's decision, not this repo's.

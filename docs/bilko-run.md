# bilko.run project card

How the Family Frame card on bilko.run works and how to edit it. The card links to the hosted app; bilko.run does not host Family Frame.

## 1. What the card is

- Slug `family-frame` is an `external-url` entry in the Bilko registry, bound to `/home/bilko/Projects/family-frame`.
- Its `url` is `https://family-frame.replit.app`. The card on https://bilko.run/projects opens it directly.
- There is no bundle to build. Do not call `publish_static_project` for `family-frame`; Bilko refuses it for external-url slugs.
- Card copy (tagline, tags, listing details) lives in `bilko.listing.json` at the repo root.
- The card's video and share image live in `bilko-card/` (section 3).

## 2. Editing the card copy

Edit `bilko.listing.json`, then call the bilko-host MCP tool `update_project_listing`:

| Argument | Value |
| --- | --- |
| `slug` | `family-frame` |
| `callerRepoPath` | `/home/bilko/Projects/family-frame` |
| `patch` | the changed fields from `bilko.listing.json` |

- Changing the card's `url` works the same way (`patch: { "url": "https://..." }`).
- `listing.video` and `listing.shareImage` in `bilko.listing.json` only mirror what `set_listing_media` set (section 3). Do not edit them by hand or send them with `update_project_listing`: a path whose bytes bilko.run never received makes the card request a missing file.

Host limits: tagline <= 160 chars, <= 6 tags (each <= 24), detail <= 400, audience <= 200, <= 5 talking points (each <= 200), callToAction <= 120, <= 5 avoidClaims (each <= 200), file < 16 KB.

## 3. Card video and share image

`bilko-card/` holds the card's media. Family Frame owns these files; bilko.run only hosts them. Both were uploaded with `set_listing_media` on 2026-11-16.

| File | What it is | Listing field (host limit) |
| --- | --- | --- |
| `bilko-card/tile.mp4` | The 60 s demo video (Project Home video `vid-mwi5j7ogfq5`), H.264 + AAC, 1200x630, faststart, 6.5 MB | `listing.video` (MP4 with `ftyp`, <= 8 MB) |
| `bilko-card/og.png` | Its closing frame (name, "Free / Passion project / Early testers welcome", URL) | `listing.shareImage` (1200x630 PNG, <= 5 MB) |

- Both were rendered from the demo's HTML by seeking `window.smDemo` frame by frame at 30 fps in headless Chromium (1200x675 viewport, rows 10-639 kept), with the embedded MP3 as the soundtrack.
- The active card on https://bilko.run/projects plays the video muted and looping, with Pause/Play and Unmute buttons. `og.png` is the video's poster, the card's hero image and the X/LinkedIn link preview (https://bilko.run/og/family-frame.png).
- bilko.run serves each file at `https://bilko.run/projects/family-frame/_media/<sha256>.<ext>`, named by the sha256 of its bytes. `bilko.listing.json` mirrors both paths, and `script/bilko-card.test.ts` fails `npm test` when they no longer match the files in `bilko-card/`.

To replace a file:

1. Write the new file over `bilko-card/tile.mp4` or `bilko-card/og.png`.
2. Call the bilko-host MCP tool `set_listing_media`:

| Argument | Value |
| --- | --- |
| `slug` | `family-frame` |
| `callerRepoPath` | `/home/bilko/Projects/family-frame` |
| `media` | `{ "video": "<abs path>/bilko-card/tile.mp4", "shareImage": "<abs path>/bilko-card/og.png" }`, leaving out a file that did not change |

3. Copy each returned path (`listing: video -> /projects/family-frame/_media/...`) into `bilko.listing.json`.
4. After about a minute, check that the card plays the new video on https://bilko.run/projects and that https://bilko.run/og/family-frame.png shows the new image.

- If the result says `upload failed`, run the same call again with the same files.
- `null` removes a field: `{ "video": null }` takes the video off the card. Then delete that key from `bilko.listing.json`.

## 4. Visibility

Whether the card is public on `/projects` is the Bilko owner's decision, not this repo's.

# Validation: 59-remove-radio-fab, tv-channel-access

Base: b65849ca34b8e4f86ac3a0f73ff6b6c204c78982. Commits: 74dd9ec (59), 2036337 (tv-channel-access).
Both PRD files were found under `prds-archived/` or `prds/` (tv-channel-access is `60-tv-channel-access.md`).

## Gate environment caveat
The worktree has no `node_modules`. I symlinked the main checkout's one (git-ignored, removed afterwards). It lacks `vitest` and `@clerk/react` / `@clerk/express`.
- `npm run check` (tsc): only 4 errors, all `TS2307 Cannot find module '@clerk/...'` in App.tsx, calendar.tsx, messages.tsx and server/index.ts. None are in tv.tsx, and none come from the diff (App.tsx's error is on the existing Clerk import at line 10). Typecheck is otherwise clean, so no dangling RadioFAB import.
- `npm test`: `vitest: not found`. Could not run.
- `npm run build`: fails resolving the missing dependencies. Could not confirm.
So the gates could not be re-run green here; the evidence below comes from reading the tree.

## 59-remove-radio-fab — VERIFIED (static evidence; gate not runnable in this env)
- radio-fab.tsx deleted: `ls` reports no such file; `grep -rnE "RadioFAB|radio-fab" client/src` returns nothing.
- App.tsx: the import and the `<RadioFAB />` element are removed (diff, lines 37 and 266). `<AppControlsWidget />` is still rendered.
- tv.tsx:193 `if (radioService.getState().isPlaying) radioService.pause();` comes right after the `if (!video) return;` guard, before the HLS source is attached. The import is at line 11.
- radio.tsx and radio-service.ts: empty diff against base.

## tv-channel-access — VERIFIED (static evidence; gate not runnable in this env)
- Open-channels button (tv.tsx:485-496): renders when `!sidebarOpen && (showControls || !isPlaying)`. It has `absolute right-4 top-1/2 -translate-y-1/2 z-20 h-14`, a `List` icon, the text "Channels", `aria-label="Show channels"`, `data-testid="button-open-channels"`, and `onClick` calls `setSidebarOpen(true)`. The only z-index class in the file is this `z-20`, so the overlays have no higher z-index.
- Control-bar toggle (tv.tsx:612-625): the visible "Channels" span is next to the chevron, `aria-label` is `sidebarOpen ? "Hide channels" : "Show channels"`, and the `button-toggle-channels` testid is kept.
- Country tabs (tv.tsx:641-646): the container is `flex flex-nowrap gap-2 overflow-x-auto`, each tab has `shrink-0`, and a ref map plus a `useEffect` on `selectedCountry` calls `scrollIntoView({ inline: "nearest", block: "nearest" })` (tv.tsx:96-102).
- Activity handlers: `mousemove`, `touchstart` and `click` listeners on the container are unchanged (tv.tsx:130-132).
- Existing testids: the diff does not touch button-play-pause, button-mute, slider-volume, button-fullscreen, tab-tv-country-* or button-channel-*.

## Findings
### Critical
- none
### Important
- Environment: the gate commands (`npm test`, `npm run build`, a full-clean `npm run check`) cannot pass in this worktree because dependencies are missing (see caveat). Re-run them in a fully installed checkout before release.
### Minor
- tv.tsx:131-138: the cleanup removes `mousemove` and `touchstart` but I saw no `click` removal in the lines shown. This predates the diff, but is worth a glance for a listener leak.
- No diff review tooling beyond manual self-review was used. I found no secrets, unsafe input handling or duplicated helpers in the combined diff (UI-only changes).

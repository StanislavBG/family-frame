# Validation: photos-fullscreen-exit

Base: d878247 (known). Commit for PRD 245: 35fd575 (only `client/src/pages/photos.tsx`).

## 245-photos-fullscreen-exit-stays — VERIFIED

1. No `onExit`: `client/src/pages/photos.tsx:56` and `:279` are `useFullscreen({ autoEnter: true })`. `grep useLocation|setLocation|onExit` in the file returns no hits; the wouter import is now `useSearch` only (line 7).
2. Settings button: `button-photo-settings` is first in the control row of both overlays, with the Settings icon, `aria-label="Photo settings"`, ghost style and `text-white hover:bg-white/20`. It sits before `button-fullscreen` in each component (diff hunks at ~222 and ~398).
3. `openSettings` (lines 57-66 and 280-289): if `document.fullscreenElement`, it awaits `document.exitFullscreen()` in try/catch (swallowed), then calls `setAppSettingsOpen(true)`. Otherwise it only calls `setAppSettingsOpen(true)`. `PixabayPhotoDisplay` gained `useAppControls()` (line 272).
4. The fullscreen button has `aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}` in both. Play/Pause and Next are not in the diff.
5. `git diff d878247..HEAD --stat -- client/src/hooks client/src/pages/tv.tsx` is empty, so both are unchanged. The diff touches one file.
6. Gate `npm run check && npm test`, re-run after `npm ci`: tsc exit 0; server node:test 403/403 pass; vitest 15 files / 188 tests pass; `npm test` exit 0.

## Findings

Critical: none.

Important: none.

Minor:
- Not tried in a browser. The loop fix relies on the hook's `hasAutoEntered` ref (`use-fullscreen.ts`), so auto-enter fires once per mount. Navigating away and back to /photos still remounts and re-enters fullscreen. That is the intended behaviour per the PRD's out-of-scope list.
- `openSettings` is duplicated verbatim in both components (`photos.tsx:57`, `:280`). Harmless; a shared hook could replace it later.
- No unit test covers the new behaviour. The PRD named none.

Review/security: `/code-review` and `/security-review` were not run. Self-review of the diff found no unsafe input handling, secrets, path handling or new network calls. It is client-only UI wiring.

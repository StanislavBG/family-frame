# Validation: calendar-delete-in-edit-dialog + strip-spoofable-auth-headers

Base: 3c532e71 (given). Commits: 3d65368 (calendar), 97f70b8 + merge 78dcc61 (auth).
Gates were run with a temporary symlink to the main checkout's `node_modules`, because the worktree has none. The symlink was removed afterwards.

## calendar-delete-in-edit-dialog — VERIFIED
- Owner-only Delete button: `calendar.tsx` has `isEditingOwner` derived from `!creatorId || creatorId === user?.id`. The footer renders `data-testid="button-delete-event"` (`variant="destructive"`, `mr-auto`) only when `isEditingOwner`.
- Confirmation: an `AlertDialog` titled "Delete event?" names `editingEvent?.title`. The action calls `deleteEventMutation.mutate(editingEvent.id)` after `e.preventDefault()`. Cancel is `AlertDialogCancel`, which leaves the event untouched.
- Success handling and pending state: `onSuccess` calls `setConfirmDeleteOpen(false)`, `setEditEventOpen(false)` and `setEditingEvent(null)`. The confirm button is `disabled={isPending}` and reads "Deleting...".
- Non-owner: the form is wrapped in `<fieldset disabled={!isEditingOwner}>`. Delete and Update are hidden, the button reads "Close", and `text-event-readonly` shows "Created by {creatorName} — only they can change it." The creator name falls back to "another household" when it is missing.
- Dead code removed: `rg 'EventCard|handleDeleteEvent|Pencil' calendar.tsx` returns nothing. The `Pencil` import is gone, and `Trash2` is still used.
- Gate `npm run check`: exit 0.

## strip-spoofable-auth-headers — VERIFIED
- Factory: `server/auth.ts` exports `createSessionHeaderMiddleware(deps)` with the specified `SessionHeaderDeps` signature.
- Header handling: both headers are deleted first, before any other work. The cookie is `__session || __clerk_db_jwt`. Headers are set only when `claims.sub` is present. Errors are caught, and `next()` is called once, outside the try block.
- Wiring: `server/index.ts` calls `app.use(createSessionHeaderMiddleware({...}))` with the exact deps from the PRD, in the same position as the old inline middleware.
- Tests: `server/auth.test.ts` has 5 tests, all passing. They cover no cookie, an invalid cookie (throws), a valid cookie overriding spoofed headers, the `__clerk_db_jwt` cookie, a missing cookies object, and a null verify result. Each test asserts that next is called once.
- Client check: `rg 'x-clerk-user-id' client/src` finds nothing.
- Gate `npm run check && npx tsx --test server/auth.test.ts`: exit 0, 5 of 5 tests pass.

## Findings
### Critical
- None.
### Important
- `server/auth.ts:~30`: the middleware sets identity from the cookie only. If another entry point reads the identity headers before this middleware runs, for example a pre-middleware route, spoofing is still possible. I did not find one: `index.ts` mounts this middleware before `registerRoutes`. Worth keeping in mind when the later bearer/PAT PRDs (7, 8) add auth paths, because they must also strip or overwrite these headers.
### Minor
- `server/middleware.ts:75` adds `weekStartsMonday: true` to the default user data. This file is outside both PRDs' `# Files` lists, so it looks like a typecheck fix. It is harmless, but it is scope creep that the PRD should have mentioned.
- `calendar.tsx` fieldset JSX is not re-indented, which is cosmetic only.
- A `fieldset disabled` does not disable Radix Select or popover triggers rendered in portals. They are inside the fieldset, so they are disabled in the DOM, and the server enforces ownership anyway.

Security self-review: no secrets, no path handling, and input is limited to cookies passed to Clerk's verifier. Ownership is also enforced server-side on DELETE (per the PRD).

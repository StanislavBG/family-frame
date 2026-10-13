# Validation: household-email plan

Base: 5266aa8dacd9781f64812f277d149948ba33fffd (from PRD 265 notes). Reviewed HEAD fdaea5d. The worktree had no node_modules, so I symlinked the main checkout's (git-ignored, not committed) to run gates.

Gates re-run in the foreground, all exit 0:
- `npx tsx --test server/household-inbox-{schema,service,routes}.test.ts`: 39 pass, 0 fail
- `npm run check` (tsc): clean
- `npm test`: vitest 206 pass (17 files); node:test 453 pass, 0 fail (includes auth.test.ts and route-inventory.test.ts)
- `npx vitest run client/src/lib/household-inbox.test.ts`: 4 pass
- `npm run inbox:test`: 40 pass, 0 fail
- `npm run inbox:check`: clean
- 264 gate is `none`, checked by reading.

Commit mapping came from `git log 5266aa8..HEAD`: 54b942f (253), bda614a (254), 22fc56f (255), 17bc724 (256), f4cc8ae (257), df6a9bd (258), 97c84a0 (259), bad76d9 (260), 8d0b52f (261), f79a749 (262), 053b602 (263), fdaea5d (264).

## Per-PRD verdicts

- **253 household-inbox-shared: VERIFIED.** `shared/household-inbox.ts` has the key/slug/address/tag helpers; the confirm URL allowlist is at `shared/household-inbox.ts:76-86` (https only, hosts mail-settings.google.com and mail.google.com). `deliverRequestSchema` refines `confirmUrl` with it (line 121). `server/household-inbox-schema.test.ts` passes.
- **254 household-inbox-service-core: VERIFIED.** `server/household-inbox-service.ts:77-155` has getState/enable/disable/rotate/setSourceStatus. Rotate removes the old key index (`:137`). Sources are stored under a sanitized key (`sourceKey`, `:68`). The service tests pass.
- **255 household-inbox-deliver: VERIFIED.** `deliver()` is at `:202-262`. Unknown key gives `unknown` (`:205`). Blocked gives `dropped` (`:225`). Anything that is not approved and authenticated is held (`:227`) with a cap of 50. Only approved and authenticated mail reaches `upsertEmails` (`:253`). Releasing and dropping held mail on approve/block is at `:152-153`.
- **256 household-inbox-routes: VERIFIED.** `server/household-inbox-routes.ts`: session-only handlers return 401 without a user and 403 unless `x-ff-auth=session` (`:41-56`). The deliver route requires `x-ff-auth=service` (`:120`). Route tests pass.
- **257 household-inbox-wire: VERIFIED.** `server/auth.ts` allows service-token paths only under `/api/service/events/` and `/api/service/inbox/` (case-insensitive). `auth.test.ts:447-470` covers the allowed path, PAT 403, `/api/household/inbox` refused and `/api/service/inboxx` refused. The route is registered in `server/routes.ts` and the snapshot at `server/route-inventory.snapshot.json:43-48` is updated.
- **258 household-inbox-client-hooks: VERIFIED.** `client/src/lib/household-inbox.ts` and its test pass (vitest, 4 tests).
- **259 household-email-settings-ui: VERIFIED.** `client/src/components/household-email-settings.tsx` is mounted at `client/src/pages/settings.tsx:780`. The `verifyUrl` link uses `rel="noopener noreferrer"` (`:160-164`). `npm run check` is clean.
- **260 mail-intake-gmail-client: VERIFIED.** `services/mail-intake/gmail.ts` and its tests pass in inbox:test and inbox:check.
- **261 mail-intake-route: VERIFIED.** `services/mail-intake/route.ts`: no tag gives skip. `authenticated` is true only when a dkim/spf pass result matches the source domain (`:37-49`). Confirmation URLs are filtered through `isGmailConfirmUrl` (`:59`). The final `deliverRequestSchema.safeParse` runs at `:93`.
- **262 mail-intake-run: VERIFIED.** `run.ts` is bounded (max 50) and idempotent (`ff-routed` / `ff-failed` labels, query excludes both). A 4xx labels the message failed, and a 5xx or network error stops the run so the message is retried. `ff-inbox-client.ts` requires https (http only for localhost or 127.0.0.1) and has a timeout.
- **263 mail-intake-auth: VERIFIED.** The loopback OAuth flow writes the token file at mode 0600 plus chmod (`auth.ts:105-108`). No secrets are logged.
- **264 household-email-docs: VERIFIED.** `docs/household-email.md` covers the operator setup. `CLAUDE.md` adds the household-email rules, the `HOUSEHOLD_INBOX_ADDRESS` env var and the mail-intake tree entry. The systemd service and timer are in `services/mail-intake/systemd/`.

## Security focus
- Service token reach is limited to the two prefixes. Tested, including case variants and lookalike `/api/service/inboxx`.
- Unknown or unauthenticated sources are held, never delivered (`service:227`). Blocked sources are dropped. Held mail is released only on explicit household approval.
- The URL allowlist is https and host-exact (no lookalike hosts), enforced in the shared schema, the intake parser and the server.
- No `claude -p` call sites in this plan, so the model-pinning rule is not relevant.

## Findings

### Critical
- none

### Important
- none

### Minor
- `server/household-inbox-service.ts:211-222`: the verification path does not require `authenticated`. A spoofed `From: forwarding-noreply@google.com` with a valid household key can create a pending source and a Gmail-hosted `verifyUrl`. The impact is limited by the host allowlist, the key secrecy and the manual approval step, but gating on `req.authenticated` would close it.
- `server/household-inbox-service.ts:169-170`: `dropHeld` and `readHeld` are not atomic with the status change, so a concurrent delivery can briefly leave an entry behind. It is bounded by the 50-entry cap.
- The organize consent flag (`setOrganize`, `PUT /api/household/inbox/organize`) was added in 254/256 ahead of its consumers (PRDs 266-269, still queued). That is expected and has no behavioural effect yet.

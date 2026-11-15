---
paths:
  - "server/household-inbox-*.ts"
  - "shared/household-inbox.ts"
  - "services/mail-intake/**"
  - "client/src/components/household-email-settings.tsx"
---

# Household email

- The routing key is secret and rotatable; rotating retires the old address.
- Unknown or unauthenticated sources are held until the household approves them.
- The `ff_svc_` service token reaches only `/api/service/events/` and `/api/service/inbox/` (`server/auth.ts`).
- Organize (bills -> utilities series `mail-<vendor>-<category>`, daily reports -> `ff-person-day`) is opt-in and re-checked on every service call.
- `INBOX_ORGANIZE=off` disables organize; a run makes at most 20 Haiku calls.
- Mail-intake prompts hold email content only (subject and text), no profile data and no tools: the documented exception to the Events no-names rule.
- Every `claude -p` call pins `--model` via `services/events-pipeline/haiku.ts`.
- `services/mail-intake` is outside the root `npm test` / `npm run check`; use `npm run inbox:test` / `npm run inbox:check`.
- Attachments (PDF bills, photos) are not handled.

Full guide: `docs/household-email.md`.

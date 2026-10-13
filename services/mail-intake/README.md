# mail-intake

Local job that reads the operator's Gmail inbox and delivers forwarded mail to households. Full guide: [docs/household-email.md](../../docs/household-email.md).

Scripts (run from the repo root):

- `npm run inbox:run` - one bounded, idempotent intake run (what the timer calls)
- `npm run inbox:run -- auth` - one-time Gmail authorization; saves the refresh token
- `npm run inbox:test` - tests for this service
- `npm run inbox:check` - type check for this service

systemd units: `systemd/family-frame-inbox.service` and `.timer` (every 5 minutes).

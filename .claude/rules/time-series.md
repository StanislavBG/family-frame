---
paths:
  - "shared/time-series.ts"
  - "server/time-series-service.ts"
  - "server/metrics-routes.ts"
  - "client/src/lib/time-series.ts"
  - "client/src/lib/bills.ts"
  - "client/src/lib/bills-chart.ts"
  - "client/src/components/time-series/**"
  - "client/src/components/bills/**"
  - "client/src/pages/utilities.tsx"
---

# Time-series (metrics) and Utilities

- Displays are built by tag: tag `utilities` feeds the Utilities app (`client/src/pages/utilities.tsx`).
- Never hard-code series ids or vendor names in the client.
- Bill display text comes from the series fields and annotations described in `docs/time-series.md`.
- Points upsert by `t`, so re-publishing is idempotent.
- The pure Bill model lives in `client/src/lib/bills.ts` and chart math in `client/src/lib/bills-chart.ts`; keep logic there, unit-tested.
- Design source: `docs/design/household-bills-v2.dc.html`.
- MCP `metrics_*` tools in `server/mcp.ts` reuse `server/time-series-service.ts`; never duplicate route logic.
- Scopes `metrics:read` and `metrics:write` (write implies read).
- This data is private per account and never exposed through household connections.

Full guide: `docs/time-series.md`.

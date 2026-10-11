# Time-series (metrics)

How an agent (for example "Self") publishes named time-series to Family Frame, and how tags turn them into displays. Authentication, tokens and scopes are in `docs/agent-access.md`; the schemas are in `shared/time-series.ts`, the logic in `server/time-series-service.ts`, the REST routes in `server/metrics-routes.ts` and the MCP tools in `server/mcp.ts` (`metrics_*`).

Data is private per account. It is never shared through household connections.

## Data model

A **series** is a named stream of numeric **points**. Series ids are lowercase slugs: `^[a-z0-9][a-z0-9-]{0,63}$`.

### Series fields (`PUT` body)

| Field | Type | Required | Limit / rule |
| --- | --- | --- | --- |
| `title` | string | yes | trimmed, 1-120 characters (`titleMax`) |
| `description` | string | no | up to 2000 characters (`descriptionMax`) |
| `summary` | string | no | up to 4000 characters (`summaryMax`) |
| `tags` | string[] | no (default `[]`) | up to 10 (`tagsMax`); each is trimmed, lowercased, `^[a-z0-9][a-z0-9-]{0,31}$`; duplicates are removed |
| `unit` | string | no | trimmed, 1-24 characters (`unitMax`) |
| `color` | string | no | `#RRGGBB` hex |
| `annotations` | JSON object | no | free-form; at most 16384 bytes of JSON (`annotationsBytesMax`) |

The body is strict: unknown fields are rejected with 400. A user can hold at most 200 series (`seriesPerUserMax`). Replacing a series with `PUT` keeps its existing points.

A series read returns the stored fields plus computed ones: `id`, `createdAt`, `updatedAt`, `pointCount`, `firstT`, `lastT` and `latest` (`{t, value}` or `null`). Unset `unit`/`color` are `null`; unset `description`/`summary` are `""`; unset `annotations` is `{}`.

### Point fields

| Field | Type | Required | Limit / rule |
| --- | --- | --- | --- |
| `t` | string | yes | `YYYY-MM-DD` (a real calendar date, read as UTC midnight) or an ISO-8601 datetime with `Z` or an offset, e.g. `2026-10-01T08:30:00Z` |
| `value` | number | yes | finite |
| `label` | string | no | up to 200 characters (`labelMax`) |
| `annotations` | JSON object | no | free-form; at most 2048 bytes of JSON (`pointAnnotationsBytesMax`) |

A series holds at most 5000 points (`pointsPerSeriesMax`). One write carries 1-500 points (`batchMax`).

**Points upsert by `t`.** A point whose `t` already exists replaces it, so re-publishing the same data is idempotent. If a batch repeats a `t`, the later entry wins. Writes are all-or-nothing per call.

## REST

All routes need a session or a PAT with `metrics:read` (`GET`) or `metrics:write` (everything else; implies read). Errors are `{"error": "..."}`. Without identity the status is 401.

| Method | Path | Body / query | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET` | `/api/metrics/tags` | none | 200 `[{tag, count}]` | 401 |
| `GET` | `/api/metrics/series` | query `tag` (optional, filter) | 200 array of series | 401 |
| `PUT` | `/api/metrics/series/:seriesId` | series fields above | 200 the series | 400 invalid id or body; 409 series limit reached |
| `GET` | `/api/metrics/series/:seriesId` | none | 200 the series | 400 invalid id; 404 not found |
| `DELETE` | `/api/metrics/series/:seriesId` | none | 204; deletes the series and all its points | 400; 404 |
| `POST` | `/api/metrics/series/:seriesId/points` | `{"points": [{t, value, label?, annotations?}, ...]}` | 200 `{upserted, pointCount}` | 400 invalid body or more than 5000 points; 404 series not found |
| `GET` | `/api/metrics/series/:seriesId/points` | query `from`, `to` (date or datetime, inclusive), `limit` (default 1000, max 5000) | 200 points, oldest first; when capped, the newest are kept | 400 invalid `from`/`to`; 404 |
| `DELETE` | `/api/metrics/series/:seriesId/points` | query `t` (required) | 204 | 400 invalid `t`; 404 series or point not found |

The series must exist before points are posted.

## MCP tools

Tools at `POST /mcp` (see `docs/agent-access.md`). Reads need `metrics:read` or `metrics:write`; writes need `metrics:write`.

| Tool | Scope | Inputs |
| --- | --- | --- |
| `metrics_list_tags` | read | none. Tags in use with series counts. |
| `metrics_list_series` | read | `tag` (optional). |
| `metrics_get_series` | read | `seriesId`; optional `from`, `to`, `limit`. Returns `{series, points}`. |
| `metrics_put_series` | write | `seriesId`, `title`; optional `description`, `summary`, `tags`, `unit`, `color`, `annotations`. Create or replace; points are kept. |
| `metrics_add_points` | write | `seriesId`, `points` (1+ of `{t, value, label?, annotations?}`). Upserts by `t`. |
| `metrics_delete_point` | write | `seriesId`, `t`. |
| `metrics_delete_series` | write | `seriesId`. Deletes the series and all its points. |

## Tags drive displays

Tags decide where a series appears; nothing else needs configuring.

- Tag `utilities` shows the series in the **Utilities** app (one tile per series).
- Other tags are reserved for future boards (for example a `health` or `garden` board). A series with no matching board is still stored and readable through the API.
- Add several tags freely, for example `["utilities", "gas"]`; the second tag can group or filter later.

## Utilities conventions

The Utilities app reads these conventions. Follow them so tiles show the right thing.

- **One series per vendor/account**, e.g. `pse-gas`, `comcast-internet`.
- `value` = the **amount due** for that bill.
- `unit` = an ISO currency code, e.g. `USD`.
- Point `t` = the **billing date** (`YYYY-MM-DD`).
- Optional point `annotations`:
  - `dueDate` (`YYYY-MM-DD`): shown on the tile, with overdue/due-soon status
  - `paid` (boolean): `true` shows a **Paid** badge instead of overdue/due soon
  - `paymentStatus` (string): `paid` shows **Paid**; `autopay` or `autopay-scheduled` shows **Autopay**.
    Any other value (e.g. `due`, `past-due`, `unknown`) keeps the `dueDate` status.
    The tile reads `paid`/`paymentStatus` from the **latest** point only.
  - `periodStart`, `periodEnd` (`YYYY-MM-DD`)
  - `usage` (number) and `usageUnit` (e.g. `therms`, `kWh`)
  - `autopay` (boolean)
  - `invoiceNo` (string)
- Series `annotations` hold facts about the account, such as `account` and `vendor`.
- Optional series `annotations.health` reports the publisher's own checks:
  - `severity`: `ok`, `warn` or `alert`. `warn` shows an amber warning on the tile and `alert` a red one,
    with the series `summary` as its text (so put the reasons there, e.g. `WARN: next bill 5 days behind`).
    `ok` or missing shows nothing.
  - `checkedAt` (ISO datetime): when the publisher last checked this series. Re-publish it on every run,
    even when nothing changed. Missing or invalid falls back to the series `updatedAt`.
  - Other keys (e.g. `nextBill`, `collector`) are free-form and not read by the tile.
- **Stale data**: a series whose `checkedAt` (or `updatedAt`) is older than 48 hours shows a
  "Not updated recently" marker. When every series on the board is stale, the board shows one banner,
  "Utilities not updated since <date>", instead.

## Worked example: bills

Set `TOKEN` to a PAT with `metrics:write` (create or edit one in Settings → Agent Access).

```bash
BASE=https://family-frame.replit.app
TOKEN=ff_pat_...

# 1. Create (or replace) the series
curl -X PUT "$BASE/api/metrics/series/pse-gas" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "title": "PSE Gas",
    "description": "Natural gas for the house",
    "summary": "Monthly gas bill from Puget Sound Energy",
    "tags": ["utilities", "gas"],
    "unit": "USD",
    "annotations": { "vendor": "Puget Sound Energy", "account": "2200-1234-5" }
  }'

# 2. Publish two bills (safe to re-run: points upsert by t)
curl -X POST "$BASE/api/metrics/series/pse-gas/points" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "t": "2026-09-05",
        "value": 84.12,
        "label": "September",
        "annotations": {
          "dueDate": "2026-09-26",
          "periodStart": "2026-08-05",
          "periodEnd": "2026-09-04",
          "usage": 31,
          "usageUnit": "therms",
          "autopay": false,
          "invoiceNo": "INV-77012"
        }
      },
      {
        "t": "2026-10-05",
        "value": 91.4,
        "label": "October",
        "annotations": {
          "dueDate": "2026-10-26",
          "periodStart": "2026-09-05",
          "periodEnd": "2026-10-04",
          "usage": 36,
          "usageUnit": "therms",
          "autopay": false,
          "invoiceNo": "INV-80333"
        }
      }
    ]
  }'
# => {"upserted":2,"pointCount":2}
```

The series now appears as a tile in the Utilities app because of its `utilities` tag.

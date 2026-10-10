# Publishing per-person data

How a household points its own agent at its own Family Frame account so the **People** app shows each person's calendar, inbox, photos and daily sheets. Nothing here is specific to one household: a family with a daycare toddler and a family with school-age kids use the same stores and tools. For tokens, scopes and general limits see `docs/agent-access.md`.

## 1. What the People app shows

The People app picks one household member and filters existing stores by that person. It adds no storage of its own.

| Tab | Shows | Fed by |
| --- | --- | --- |
| Dashboard | Today's and this week's summary, metrics, highlights | `ff-person-day` and `ff-person-week` records for the person |
| Inbox | Emails about the person | Mailbox emails with the person in `personIds` |
| Calendar | The person's events | Calendar events with the person in `people` |
| Photos | The person's images and PDFs | Media files with the person in `personIds` |
| Sheets | Daily sheets, one per day, with timeline, tags and highlights | `ff-person-day` records for the person |
| More | Any other dataset records tagged with the person | Records in agent-registered datasets with the person in `personIds` |

Note: the People page in the client is still a placeholder at the time of writing; the stores and tools below are in place and tagged data is kept until the tabs render it.

## 2. Setup per household

Do this in the household's **own** account. Data is never copied between accounts.

1. Add the people in **Global Config** (Settings). Each person gets an id.
2. In **Settings → Agent Access** create a token with `mail:write`, `media:write`, `data:write` and `calendar:write` (the read scopes come with them; `calendar:read` is always included).
3. Connect the agent to the MCP endpoint:

```bash
claude mcp add --transport http family-frame https://family-frame.replit.app/mcp --header "Authorization: Bearer ff_pat_..."
```

## 3. Discover person ids

Call the MCP tool `list_people` (no inputs). It returns each household member's `id` and `name`.

REST equivalent: `GET /api/people/list` (`calendar:read`).

In MCP tools, `personIds`, `personId` and calendar `people` accept either an id or a name (case-insensitive); an unknown name returns an error listing the known people. REST calls take **ids only**: resolve names with `list_people` first. At most 20 person ids per item (`PERSON_IDS_MAX`).

## 4. Publish, store by store

In every example below, `p_ev1` stands for a person id from `list_people`.

### Calendar

MCP `create_event` (`calendar:write`), with `people`:

```json
{ "title": "Parent-teacher conference", "startDate": "2026-10-14", "type": "Private", "people": ["Evolet"] }
```

REST: `POST /api/calendar/new-event` with the same fields; `people` holds person ids.

Use `Private` for school and daycare events. `Shared` events are visible to connected homes.

### Mail

MCP `mail_upsert_emails` (`mail:write`), `personIds` on each email:

```json
{ "emails": [{
  "id": "18c3f0a1b2d4e5f6",
  "receivedAt": "2026-10-09T16:05:00-07:00",
  "from": { "name": "Little Sprouts", "email": "daily@example.com" },
  "subject": "Evolet's day",
  "text": "Evolet napped 12:30-2:15 and ate all her lunch.",
  "kind": "daycare",
  "personIds": ["Evolet"]
}] }
```

REST: `POST /api/mail/messages` with `{ "emails": [...] }`; `personIds` are ids. Filter reads with `personId` (MCP `mail_list_emails`, REST `GET /api/mail/messages?personId=`).

### Media

MCP `media_upload` (`media:write`), `personIds` optional:

```json
{ "filename": "evolet-2026-10-09.jpg", "mimeType": "image/jpeg", "base64": "<base64 bytes>", "tags": ["daycare"], "personIds": ["Evolet"] }
```

REST (preferred for bulk): `POST /api/files?filename=evolet-2026-10-09.jpg&personIds=p_ev1` with the raw bytes as body and the file's `Content-Type`. `personIds` is a comma-separated query value.

To rehost an expiring link, MCP `media_import_url`:

```json
{ "url": "https://cdn.example.com/photo123.jpg", "tags": ["daycare"], "personIds": ["Evolet"] }
```

REST: `POST /api/files/import` with body `{ "url", "personIds": ["p_ev1"] }`.

The returned meta includes `url` (`/api/files/<id>`); put the file id in a day record's `mediaIds` to attach it to a sheet.

### Datasets: `ff-person-day` and `ff-person-week`

`ff-person-day` and `ff-person-week` are built-in schemas owned by Family Frame (`shared/person-views.ts`). The `ff-` prefix is reserved: you cannot register your own schema with it, and you do not need to register these. Check them with `data_list_schemas`.

MCP `data_put_records` (`data:write`) with `schemaId`, and per record `{ id, data, emailIds?, personIds }`. REST: `POST /api/data/records/ff-person-day` with `{ "records": [...] }` (person ids only).

Reads filter with `personId` (MCP `data_list_records`, REST `GET /api/data/records/:schemaId?personId=`).

`ff-person-day` `data` fields (`date` and `title` required, unknown fields rejected):

| Field | Notes |
| --- | --- |
| `date` | `YYYY-MM-DD`. |
| `title` | 1-200 chars. |
| `source` | Max 120, where the sheet came from. |
| `summary` | Max 2000. |
| `metrics` | Max 12 of `{ label (max 40), value (max 40), tone? }`; `tone` is `neutral`, `good`, `warn` or `info`. |
| `tags` | Max 30 of `{ label (max 120), group? (max 40) }`. |
| `highlights` | Max 20 of `{ title? (max 80), text (max 1000) }`. |
| `timeline` | `{ start?, end?, spans? (max 10 of {start, end, label}), events? (max 50 of {time, kind, label}) }`. Times are 24-hour `HH:MM`. |
| `mediaIds` | Max 50 media file ids. |
| `emailIds` | Max 20 mailbox email ids. |
| `sourceUrl` | `https://` only, max 2048. |
| `sentAt` | ISO date-time. |

`ff-person-week` `data` fields (`weekStart` and `title` required): `weekStart` (`YYYY-MM-DD`), `title`, `summary` (max 4000), `metrics` (as above), `highlights` (max 20 of `{ date?, text (max 500) }`), `emailIds` (max 20).

#### Example: daycare toddler (`ff-person-day`)

```json
{
  "schemaId": "ff-person-day",
  "records": [{
    "id": "p_ev1-2026-10-09",
    "personIds": ["p_ev1"],
    "emailIds": ["18c3f0a1b2d4e5f6"],
    "data": {
      "date": "2026-10-09",
      "title": "Friday at Little Sprouts",
      "source": "Little Sprouts daily sheet",
      "summary": "Happy morning, long nap, ate well.",
      "metrics": [
        { "label": "Naps", "value": "1h 45m", "tone": "good" },
        { "label": "Diapers", "value": "4" },
        { "label": "Mood", "value": "Happy", "tone": "good" }
      ],
      "tags": [{ "label": "Banana", "group": "Lunch" }, { "label": "Sing-along", "group": "Activities" }],
      "highlights": [{ "title": "Words", "text": "Said \"more\" at snack time." }],
      "timeline": {
        "start": "08:00",
        "end": "16:00",
        "spans": [{ "start": "12:30", "end": "14:15", "label": "Nap" }],
        "events": [
          { "time": "10:00", "kind": "snack", "label": "Crackers and milk" },
          { "time": "11:45", "kind": "diaper", "label": "Wet" }
        ]
      },
      "mediaIds": ["u3b1c0d9e8f7a6b5"],
      "sentAt": "2026-10-09T16:05:00-07:00"
    }
  }]
}
```

#### Example: middle-school child (`ff-person-day`)

A school-age child has no naps or diapers; use the same fields for classes, homework and grades.

```json
{
  "schemaId": "ff-person-day",
  "records": [{
    "id": "p_ma2-2026-10-09",
    "personIds": ["p_ma2"],
    "data": {
      "date": "2026-10-09",
      "title": "Friday at Lincoln Middle",
      "source": "Parent portal digest",
      "summary": "Quiz in math, PE skipped for assembly.",
      "metrics": [
        { "label": "Math quiz", "value": "92%", "tone": "good" },
        { "label": "Homework due", "value": "2", "tone": "warn" }
      ],
      "tags": [{ "label": "Science", "group": "Classes" }, { "label": "Math", "group": "Classes" }],
      "highlights": [
        { "title": "Reminder", "text": "Book report due Monday." },
        { "text": "Picture day is next Friday." }
      ],
      "timeline": {
        "start": "08:15",
        "end": "15:30",
        "spans": [{ "start": "13:00", "end": "13:50", "label": "Math" }],
        "events": [{ "time": "13:40", "kind": "quiz", "label": "Fractions quiz" }]
      },
      "sourceUrl": "https://portal.example.edu/day/2026-10-09"
    }
  }]
}
```

#### Example: `ff-person-week`

```json
{
  "schemaId": "ff-person-week",
  "records": [{
    "id": "p_ma2-2026-10-05",
    "personIds": ["p_ma2"],
    "data": {
      "weekStart": "2026-10-05",
      "title": "Week of October 5",
      "summary": "Solid week; two assignments still open.",
      "metrics": [{ "label": "Absences", "value": "0", "tone": "good" }],
      "highlights": [{ "date": "2026-10-09", "text": "92% on the fractions quiz." }]
    }
  }]
}
```

## 5. Idempotency

- **Record ids are stable**: `<personId>-<date>` for `ff-person-day` (for example `p_ev1-2026-10-09`) and `<personId>-<weekStart>` for `ff-person-week`. Record ids allow `[A-Za-z0-9_-]{1,128}`, so use person ids as-is; if a person id contains other characters, slug it.
- Re-posting the same id **updates** the record, so an agent can re-run a day or a week safely. A batch is all-or-nothing and holds at most 100 records.
- Emails: use the source message id as the email `id`; re-posting updates it and keeps its read state.
- Media: identical bytes under the same id are a no-op (`created: false`); `media_import_url` derives the id from the URL, so repeats cost no fetch; a repeat adds its `emailIds` and `personIds` to the existing file (links are only ever added). `mail_rehost_images` copies an email's `personIds` onto the images it rehosts, so those images show in the person's Photos tab.
- Calendar: `create_event` always creates a new event. List first (`list_events`) and use `update_event` on reruns. Create school and daycare events as `Private`.

## 6. Privacy

All of this data is private per account. It is never shared through household connections: connected homes see only `Shared` calendar events. `personIds` are labels inside the account, not a sharing mechanism.

## 7. Unknown datasets: the More tab

A record in any dataset you registered yourself (`data_put_schema`) that carries `personIds` shows up under that person's **More** tab, so you can publish extra per-person data without a new view. Use a schema id without the reserved `ff-` prefix.

# Events app: design brief

## Purpose

Events is a Family Frame app that shows a household a curated list of local events it might enjoy: pumpkin festivals, library story times, church fairs, free concerts in the park. A service run by the Family Frame operator searches the web for events near the household's address and publishes them. The household reads them, says whether it plans to go, and tells us how good the suggestion was. We use that feedback to find better events next time.

Your job is to design every screen of that experience so it maps one-to-one onto the data in `shared/events.ts`. Field names appear in `code style` throughout. Where this brief names a field, the design should show it, hide it deliberately, or say why it is not shown.

What the household can do:

- See what is coming, with the next two weeks given the most attention.
- Open an event and decide: Going, Interested, or Not for us.
- Put a chosen event on the family calendar, as Shared or Private.
- Say how well a suggestion fit (relevant or not, liked or not, more or less like this).
- Tell us what they like, and see what we have learned about them.
- Turn the service on by giving an address and consenting to share it.

## Audience and constraints

Who uses it: a multi-generational household. A grandparent may use it on a wall-mounted screen in the kitchen. A parent may use it on a phone in a queue. Design for both, at the same time.

- **Wall-mounted displays and phones.** Wall displays are 1024px wide and up, viewed from a distance, touched rarely. Phones are 360px wide and up. Design both; the overview and event page must work at each.
- **Grandparent-friendly.** Large touch targets (at least 48px, prefer 56px for primary actions), large type (body text 18px or more on wall displays), plain words, one obvious next step per screen. No gestures that must be discovered (swipe to dismiss, long press).
- **No hover-only information.** Everything shown on hover must also be visible without a pointer. Wall screens and phones have no hover.
- **Light and dark mode.** Every colour has a light and a dark pair. Dark mode is real, not an afterthought; mounted screens run dark at night.
- **Satchel design language.** Warm parchment surfaces, tinted tiles, serif headings. The tokens already exist in `client/src/components/person/satchel.tsx` (`SATCHEL_TONES`, `SERIF`, `MONO`, `MetricTile`, `DateBadge`, `ToneChip`, `SectionLabel`). Reuse them; do not invent a second palette. Overall palette background is Warm Parchment `#FDF8F2`, primary Heritage Terracotta `#C05746`, secondary Sage Leaf `#82937A`, accent Soft Honey `#F4D06F`.
- **No third-party images or fonts loaded in the browser.** Fonts are self-hosted (Inter Variable, Source Serif 4, JetBrains Mono). Event photos from other websites (`media.imageUrl`) are not loaded in the browser, because that would send the household's IP address to a third party. Design every card so it looks complete **without a photo**: use a tinted category tile with an icon from the app's icon set. If photos arrive later through our own hosting, they are an enhancement, not something the layout depends on.
- **Wall displays roll over at midnight.** "Today" and "Next 14 days" must update on their own.

## Screens

### 1. Events overview

The home of the app. A calendar-like view of proposed events, with the next two weeks emphasised. Think of a printed family agenda: this fortnight is big and readable; everything after is a quieter list. One short paragraph of orientation at the top (for example "12 things coming up near home"), then the content.

Elements, in priority order:

1. **Next 14 days agenda.** The emphasised block. Events grouped by day, each day with a `DateBadge` and a weekday-tinted label. Each row is a card showing: `title`, start time from `schedule.start` (or the next upcoming entry of `schedule.occurrences`), `location.venueName` and `distanceKm` ("8.4 km, 18 min" using `travelMinutes`), a cost chip (Free when `cost.isFree`, otherwise from `cost.priceText` or `cost.minPrice` to `cost.maxPrice`), a category chip, and the household's current response if any.
2. **Changed badge.** A clear badge on any card whose event has a recent entry in `updates` (compare `updates[].at` and `verification.lastChangedAt` to what the household last saw). The badge says what changed in words ("Price changed", "Postponed", "Cancelled") using `updates[].kind`. Cancelled and postponed must be hard to miss on a wall display: a coloured band, not a small dot.
3. **Later list.** Everything beyond 14 days, as a calmer, denser list grouped by month. Same card content, smaller.
4. **Month view toggle.** A switch between Agenda (default) and Month. The month grid shows day cells with small tinted dots or titles by category tone; tapping a day opens that day's events. Multi-day events (`schedule.occurrences`) appear on each of their days.
5. **Category filter chips.** One chip per `category` that has events, in a horizontally scrolling row on phones and a wrapping row on wall displays. Tapping toggles. A visible "All" chip resets. Chip count is optional.
6. **Response filter.** A compact control: All, New, Interested, Going, Maybe, Not for us. Default is All except hidden ones (`not-interested` and `dismissed` are tucked away unless chosen).
7. **Entry to Events settings.** A gear or "Preferences" link to the preferences panel (screen 4).

Sorting: soonest first. Do not expose a sort control; keep it simple. Show `matchScore` only as a gentle cue (for example a small "Great fit" mark above a threshold), never as a raw number on the overview.

### 2. Event hero page

The page for one event. It must feel like an invitation, readable top to bottom with the decision (the action bar) always reachable. On a phone the action bar sticks to the bottom; on a wall display it sits beside the content.

Elements, in priority order:

1. **Status banner.** Only when `status` is not `scheduled`. Full-width, tone-coded, with plain words from `status` and `statusNote` ("Cancelled", "Postponed", "Sold out", "Moved online", "Date to be confirmed" for `tentative`). See the update timeline below.
2. **Title and summary.** `title` in the serif heading style, `summary` below it, category chip (`category`) in its tone.
3. **When.** The next date and time large (`schedule.start`, `schedule.end`, `schedule.allDay`, in `schedule.timezone`). When `schedule.occurrences` has more than one entry, show them as a short list of dates ("Sat 24 Oct, 10:00 to 16:00", "Sun 25 Oct, ..."), each selectable when planning, and show `schedule.recurrenceText` ("Saturdays and Sundays in October") as a friendly sentence. Past occurrences are greyed.
4. **Where.** `location.venueName`, `location.address`, `location.city`, `location.region`, `location.postalCode`. Beside it, the distance from home: `distanceKm` and `travelMinutes` (from the recommendation, not the event). Indoor/outdoor from `location.setting`; "Online" when `location.online`. Below, in smaller type: `location.accessibilityNotes` and `location.parkingNotes`. Offer an "Open in maps" link; it opens a new tab, nothing is embedded.
5. **Cost.** Large "Free" when `cost.isFree`; otherwise `cost.priceText` (preferred, human-written) with `cost.currency`, `cost.minPrice`, `cost.maxPrice` as fallback. Flags: `cost.ticketRequired`, `cost.registrationRequired`, with buttons to `cost.ticketUrl` / `cost.registrationUrl`.
6. **Why it suits your household.** `whyForHousehold`, in a tinted tile, plus `matchReasons` as small chips ("Within 10 km", "Weekend morning"). This is the personal part; give it weight.
7. **Why kids will love it.** `whyForChildren`, in a second tinted tile. Omit the tile if absent.
8. **Highlights.** `highlights` (up to 5 short lines) as a tick list.
9. **Tips.** `tips` (up to 5 short lines) as a light-bulb list.
10. **Ages.** `audience.ageBands` as chips, with `audience.ageMin` / `audience.ageMax` as words ("from birth"), plus `audience.familyFriendly`, `audience.strollerFriendly`, and `audience.languages`.
11. **About the event.** `description`, and `tags` as quiet chips. Collapsed after about six lines with a clear "Read more" button.
12. **Organizer.** `organizer.name`, `organizer.url`, `organizer.contact`.
13. **Sources.** `sources[]`: `title` or `publisher` as a link to `url`, `kind` as a small label (official, listing, social, news), `retrievedAt` as "checked on". Official sources first. Also show "Last checked" from `verification.lastCheckedAt`, and optionally `verification.confidence` as plain words (Confirmed, Likely, Unconfirmed), never as a percentage.
14. **Update timeline.** Shown whenever `updates` is non-empty, and expanded by default for cancelled, postponed, rescheduled and price-changed events. A vertical list, newest first: `at` as a date, `kind` as an icon plus label, `summary` as the sentence, and for `field`/`before`/`after` a "was / now" pair (for example "was $10, now $12"). `sourceUrl` links to the evidence.
15. **Action bar** (below).
16. **Feedback scale** (below).

#### Action bar

The primary decision. Three large buttons side by side, equal weight, with icons and words:

- **Going** (`response: "going"`)
- **Interested** (`response: "interested"`)
- **Not for us** (`response: "not-interested"`)

Plus a quiet fourth option, "Maybe later" (`response: "maybe"`), and a way to hide an event entirely (`response: "dismissed"`) kept inside an overflow menu so it is not hit by accident.

After Going or Interested, the page offers **Add to calendar**:

- A two-way choice: **Shared** (everyone in the household and connected homes can see it) or **Private** (just this account). This is `visibility: "Shared" | "Private"`. Explain the difference in one short line under each option. Add to calendar is a flag on the response (`addToCalendar`), so it can be set at the same moment as Going.
- If the event has several occurrences, ask which one (`occurrenceStart`).
- Optionally, who is going (`people`, up to 20 names) and a short note (`notes`).

After a choice the bar changes to show the current answer ("You are going on Sat 24 Oct, on the Shared calendar") with a **Change plan** button. Change plan lets the household switch the occurrence (`occurrenceStart`), the `people`, the `notes`, and the `visibility`, or go back to Interested / Not for us. When the response is Not for us, offer an optional one-line "Why not?" (`reason`, 280 characters max) with a few tap-to-fill examples (too far, too expensive, not our kind of thing, bad time).

#### Feedback scale

Separate from the response: this says how good the *suggestion* was. It is three pairs, each a clear two-way choice. Present them as three rows, each with an icon and plain wording, never as a 1 to 5 star scale:

| Pair | Signal values | Meaning |
|---|---|---|
| Relevant / Not relevant | `relevant`, `not-relevant` | Was this a sensible thing to suggest to us? |
| Liked / Didn't like | `liked`, `disliked` | Did we enjoy it (or, before the event, does it appeal)? |
| More like this / Less like this | `more-like-this`, `less-like-this` | What should the service do next time? |

Each pair is one tap; tapping the chosen side again clears it. An optional one-line reason (`reason`, 280 characters max) appears after any tap. Show a short thank-you ("Thanks, we will suggest more like this"). Before the event, show Relevant and More/Less like this prominently; after the event, bring Liked / Didn't like to the front (see the Past state).

### 3. Mobile and wall layouts

Not a separate screen, but the designer should provide both for screens 1 and 2.

- **Phone:** single column. Agenda cards full width. Filters collapse behind one "Filter" button with a count. Sticky action bar at the bottom of the event page.
- **Wall display:** two columns on the overview (agenda on the left taking about two thirds, Later list on the right), larger type, no scrolling needed for the next 14 days if it can be avoided (see "Dashboard fits one wall screen" in `CLAUDE.md`: scale to fit rather than drop sections). The event page is two columns: story on the left, action bar and feedback on the right.

### 4. Events settings panel (preferences)

Reached from the overview. One calm page with four blocks.

1. **What you like (stated preferences).** The household edits `EventPreferences`:
   - `likedCategories` and `avoidedCategories`: a grid of the 15 categories as tinted tiles; tap once to like, twice to avoid, a third time to clear. Show the state with icon and text, not colour alone.
   - `maxDistanceKm`: a slider from 1 to 300 km, default 30, with a big number readout and step buttons for people who struggle with sliders.
   - `budget`: three choices, `free`, `low`, `any`.
   - `preferredDays`: Weekdays, Weekends (`weekday`, `weekend`).
   - `preferredTimes`: Morning, Afternoon, Evening.
   - `languages`: small chips of language codes with friendly names.
   - `notes`: a free-text box (1000 characters max) for "anything else we should know".
2. **What we have learned.** A read-only summary built from the feedback log: for example "You tend to like: Parks and outdoors, Festivals. You tend to skip: Sports. You prefer free events and weekend mornings." Present it as plain sentences and tinted chips. Say plainly that these come from the household's own answers. Include a note on how to change it: use the controls above, or give more feedback. (The exact data shape for the learned summary is defined by the preference aggregation service; the designer should leave room for liked categories, avoided categories, preferred days and times, typical distance and free-event leaning.)
3. **Feedback history.** A reverse-chronological list of `FeedbackEntry` items: `at`, `snapshot.title`, `snapshot.category`, the `signal` as words ("You said: More like this", "You said: Going"), and `reason` if given. Responses appear with `response:` prefixed signals (`response:going`, `response:not-interested` and so on). Entries can be filtered by signal type. Read-only.
4. **Delete my event data.** A clearly separated danger zone at the bottom. A button "Delete my event data" opens a confirmation dialog in plain words: what is deleted (recommendations, responses, feedback history, learned preferences), what is kept (events already added to the calendar stay there), and that it cannot be undone. The confirm button names the action ("Yes, delete everything"), with a Cancel that is easy to hit.

### 5. Settings: address and consent step

This lives in the main Settings, in the household section, not inside the Events app. It is how a household turns Events on. It is the most sensitive screen in this brief: the design must make the data sharing unmissable and calm, never pushy.

Elements, in priority order:

1. **Address form.** Fields (`HouseholdAddress`): `line1` (street, required), `line2` (apartment or unit, optional), `city` (required), `region`, `postalCode`, `country` (required), and an optional `timezone`. Show any existing city and country pre-filled and editable. An "Address saved" confirmation. The address counts as complete once `line1`, `city` and `country` are filled in; the consent switch stays disabled, with a one-line reason, until then.
2. **Consent switch.** One large switch, off by default, labelled "Share our address with the events service". Beside or under it, show the consent wording below **verbatim**, in readable type (not small print), always visible, not behind a "learn more":

   > Share our home address with the Family Frame events service so it can find local events for our household. The service runs on the Family Frame operator's own computer. It receives our address, our household members' ages (not names or birthdays), our event preferences and our event feedback. Our exact address is only used to work out distances; AI web searches only see our city and area. Turning this off stops new recommendations right away, and the service deletes our household from its own records on its next run.

   This text is `EVENTS_SHARING_CONSENT_TEXT` in `shared/household.ts`. The designer should treat it as fixed copy. Do not shorten or reword it.
3. **Consent record.** When on, show "You agreed on 9 October 2026" (`eventsSharing.consentedAt`) and the wording version (`eventsSharing.consentVersion`). When off, show nothing or "Not sharing".
4. **Turning off.** Switching it off asks for a one-tap confirmation that restates what happens (no new recommendations; the service deletes the household on its next run) and takes effect immediately.
5. **Link to privacy page.** A link to the privacy explanation of address and event sharing.
6. **Next step.** When switched on, a button "Open Events" and a note that first suggestions can take a little while to appear (leads into the "opted in, no suggestions yet" state).

## States

Each state needs a designed screen, in light and dark, on phone and wall display. Every empty or error state has an icon, a plain sentence, and exactly one primary button.

1. **Not opted in.** The household has not turned on sharing. The Events app (if enabled) shows a friendly explainer in place of the overview: what Events does, what is shared (very short, in plain words), and one button "Set up Events" that goes to the Settings address and consent screen. No fake or placeholder events.
2. **Opted in but no suggestions yet.** Consent is on, the service has not published anything. Reassuring message: "We are looking for events near you. First suggestions usually appear within a day." Show the saved city (not the full street address) and a link to edit the address or preferences. Never show a spinner that runs forever.
3. **Normal.** The overview and event pages as described above, populated.
4. **Event cancelled.** `status: "cancelled"`. On the overview, the card is visibly struck through and tinted with a "Cancelled" band. On the event page, a full-width banner with `statusNote`, the update timeline expanded, the action bar replaced by a single "Remove from my plans" if the household had said Going (and it removes the calendar entry's relevance, not silently), and no feedback scale except "Not relevant". Related: `postponed`, `rescheduled`, `sold-out` and `moved-online` use the same banner pattern with their own words and tones; `price-changed` and `time-changed` and `venue-changed` updates use the Changed badge and a timeline entry, without a banner.
5. **Event past.** The last `schedule.occurrences` entry (or `schedule.end`) has passed, or `status` is `ended`. The event page's action bar is replaced by a prompt, **"Did you go? How was it?"** with two big answers: "We went" and "We didn't go". "We went" leads straight to the Liked / Didn't like pair, then an optional reason. "We didn't go" offers Relevant / Not relevant instead. Past events are collapsed into a quiet "Earlier" list at the bottom of the overview, only shown for events still awaiting an answer.
6. **Offline or error.** If the app cannot reach the server: keep showing the last loaded events, with a gentle banner "You are offline. Showing what we saved." and a "Try again" button. If nothing was loaded, show a full-page message with "Try again". Responses and feedback given offline should be clearly marked "Will send when you are back online". Never lose a tap silently.
7. **Loading.** Skeleton cards in the same layout as the real ones (the app already uses skeletons).

## Data available per screen

Source of truth: `shared/events.ts`. All field paths are exact. The two main record shapes are `RecommendationInput` (what the service publishes per household) and `FfEvent` (the event inside it, at `event`). The household's own response, feedback and plan are stored beside them; their wire shapes are `PostResponse`, `PostFeedback` and `PatchPlan`.

Closed value lists (use these exact values in filters and chips):

- `EVENT_CATEGORIES`: `parks-outdoors`, `nature-animals`, `kids-activities`, `baby-toddler`, `sports-fitness`, `arts-culture`, `music-performance`, `museums-learning`, `festivals-fairs`, `faith-church`, `food-markets`, `community-volunteering`, `holiday-seasonal`, `family-entertainment`, `other`
- `EVENT_STATUSES`: `scheduled`, `tentative`, `postponed`, `rescheduled`, `cancelled`, `sold-out`, `moved-online`, `ended`
- `EVENT_UPDATE_KINDS`: `cancelled`, `postponed`, `rescheduled`, `time-changed`, `venue-changed`, `price-changed`, `sold-out`, `announcement`, `details-changed`, `reinstated`
- `AGE_BANDS`: `baby`, `toddler`, `preschool`, `school-age`, `teen`, `adult`, `senior`, `all-ages`
- `HOUSEHOLD_RESPONSES`: `new`, `interested`, `going`, `maybe`, `not-interested`, `dismissed`
- `FEEDBACK_SIGNALS`: `relevant`, `not-relevant`, `liked`, `disliked`, `more-like-this`, `less-like-this`

### Events overview

From `RecommendationInput`: `matchScore`, `distanceKm`, `travelMinutes`.
From `event` (`FfEvent`): `id`, `title`, `summary`, `category`, `tags`, `status`, `statusNote`, `schedule.start`, `schedule.end`, `schedule.allDay`, `schedule.timezone`, `schedule.occurrences[].start`, `schedule.occurrences[].end`, `location.venueName`, `location.city`, `location.setting`, `location.online`, `cost.isFree`, `cost.priceText`, `cost.minPrice`, `cost.maxPrice`, `cost.currency`, `audience.ageBands`, `audience.familyFriendly`, `updates[].kind`, `updates[].at`, `updates[].summary`, `verification.lastChangedAt`.
From the household: current response (one of `HOUSEHOLD_RESPONSES`).
Not shown: `description`, `sources`, `organizer`, `media`.

### Event hero page

All of `RecommendationInput`: `whyForHousehold`, `whyForChildren`, `highlights`, `tips`, `matchScore`, `matchReasons`, `distanceKm`, `travelMinutes`.
All of `event`: `id`, `fingerprint` (not shown), `title`, `summary`, `description`, `category`, `tags`, `status`, `statusNote`, `firstSeenAt` (optional "New this week" cue);
`schedule.timezone`, `schedule.start`, `schedule.end`, `schedule.allDay`, `schedule.recurrenceText`, `schedule.occurrences[]`;
`location.venueName`, `location.address`, `location.city`, `location.region`, `location.postalCode`, `location.country`, `location.lat`, `location.lon` (for the maps link only), `location.setting`, `location.online`, `location.accessibilityNotes`, `location.parkingNotes`;
`cost.isFree`, `cost.currency`, `cost.minPrice`, `cost.maxPrice`, `cost.priceText`, `cost.ticketRequired`, `cost.registrationRequired`, `cost.ticketUrl`, `cost.registrationUrl`;
`audience.ageBands`, `audience.ageMin`, `audience.ageMax`, `audience.familyFriendly`, `audience.strollerFriendly`, `audience.languages`;
`organizer.name`, `organizer.url`, `organizer.contact`;
`sources[].url`, `sources[].title`, `sources[].publisher`, `sources[].kind` (`official`, `listing`, `social`, `news`, `other`), `sources[].retrievedAt`;
`updates[].at`, `updates[].kind`, `updates[].summary`, `updates[].field`, `updates[].before`, `updates[].after`, `updates[].sourceUrl`;
`verification.lastCheckedAt`, `verification.lastChangedAt`, `verification.checkCount`, `verification.confidence`.
`media.imageUrl` and `media.imageAlt` exist but the image is **not loaded** (third-party). `media.imageAlt` may be used as a text caption.

### Action bar

Sends `PostResponse`: `response` (`interested`, `going`, `maybe`, `not-interested`, `dismissed`), `addToCalendar` (boolean), `visibility` (`Shared` or `Private`), `people` (list of names), `reason` (up to 280 characters).
Change plan sends `PatchPlan`: `occurrenceStart`, `notes` (up to 500 characters), `people`, `visibility`. At least one field is required.

### Feedback scale

Sends `PostFeedback`: `signal` (one of `FEEDBACK_SIGNALS`), `reason` (optional, up to 280 characters).

### Events settings panel

Preferences (`EventPreferences`): `likedCategories`, `avoidedCategories`, `maxDistanceKm` (1 to 300, default 30), `budget` (`free`, `low`, `any`; default `any`), `preferredDays` (`weekday`, `weekend`), `preferredTimes` (`morning`, `afternoon`, `evening`), `languages`, `notes` (up to 1000 characters).
Feedback history (`FeedbackEntry`): `id`, `at`, `eventId`, `signal` (any `FEEDBACK_SIGNALS` value or `response:interested`, `response:going`, `response:maybe`, `response:not-interested`, `response:dismissed`), `reason`, and `snapshot.title`, `snapshot.category`, `snapshot.tags`, `snapshot.isFree`, `snapshot.distanceKm`, `snapshot.weekday` (0 to 6), `snapshot.ageBands`.
What we have learned: derived from the above; no extra fields beyond the learned categories, days, times and distance.

### Settings address and consent

Household profile (`shared/household.ts`): `address.line1`, `address.line2`, `address.city`, `address.region`, `address.postalCode`, `address.country`, `address.timezone`; `eventsSharing.enabled`, `eventsSharing.consentVersion`, `eventsSharing.consentedAt`, `eventsSharing.revokedAt`; and the fixed copy `EVENTS_SHARING_CONSENT_TEXT`. Switching off sends `{ enabled: false }`.

### Limits worth designing around

From `EVENTS_LIMITS`: up to 50 `schedule.occurrences`, 10 `sources`, 50 `updates`, 20 `tags`, 5 lines each in `highlights`, `tips`, `matchReasons`, and 280 characters for any feedback or response `reason`. `title` is up to 200 characters, `summary` up to 280, `description` up to 5000: design for long titles (wrap, never truncate on the event page).

### Suggested category-to-tone mapping

This is a **suggestion**; the designer may change it. Tones are from `SATCHEL_TONES` (clay, sun, leaf, sky, plum, stone). Aim for a stable colour per category so the family learns them.

| Category | Suggested tone |
|---|---|
| `parks-outdoors` | leaf |
| `nature-animals` | leaf |
| `kids-activities` | clay |
| `baby-toddler` | clay |
| `sports-fitness` | sky |
| `arts-culture` | plum |
| `music-performance` | sky |
| `museums-learning` | plum |
| `festivals-fairs` | sun |
| `faith-church` | stone |
| `food-markets` | sun |
| `community-volunteering` | stone |
| `holiday-seasonal` | sun |
| `family-entertainment` | clay |
| `other` | stone |

Status tones (suggestion): cancelled in clay (strong), postponed and rescheduled in sun, sold-out in stone, moved-online in sky, tentative in sun (lighter), ended in stone (muted). Never rely on colour alone; always add an icon and a word.

### Complete example recommendation

This is `SAMPLE_RECOMMENDATION_INPUT` from `shared/events.ts`, one complete recommendation as the service publishes it. It has two occurrences, a price-changed update, two sources, and all optional blocks filled. Design against this, then consider what happens when optional fields are missing.

```json
{
  "event": {
    "schemaVersion": 1,
    "id": "pumpkin-festival-2026",
    "fingerprint": "family-pumpkin-festival|2026-10-24|riverside-farm",
    "title": "Riverside Family Pumpkin Festival",
    "summary": "Pumpkin patch, hayrides and a costume parade for all ages.",
    "description": "A Saturday harvest festival at Riverside Farm with a pumpkin patch, hayrides, a petting corner, face painting, local food trucks and a children's costume parade at noon.",
    "category": "holiday-seasonal",
    "tags": [
      "pumpkins",
      "hayride",
      "costume-parade",
      "harvest"
    ],
    "schedule": {
      "timezone": "America/Los_Angeles",
      "start": "2026-10-24T10:00:00-07:00",
      "end": "2026-10-24T16:00:00-07:00",
      "allDay": false,
      "recurrenceText": "Saturdays and Sundays in October",
      "occurrences": [
        {
          "start": "2026-10-24T10:00:00-07:00",
          "end": "2026-10-24T16:00:00-07:00"
        },
        {
          "start": "2026-10-25T10:00:00-07:00",
          "end": "2026-10-25T16:00:00-07:00"
        }
      ]
    },
    "location": {
      "venueName": "Riverside Farm",
      "address": "1200 River Road",
      "city": "Portland",
      "region": "OR",
      "postalCode": "97201",
      "country": "United States",
      "lat": 45.5152,
      "lon": -122.6784,
      "setting": "outdoor",
      "online": false,
      "accessibilityNotes": "Main paths are gravel; stroller friendly.",
      "parkingNotes": "Free field parking, opens 9:30 AM."
    },
    "cost": {
      "isFree": false,
      "currency": "USD",
      "minPrice": 0,
      "maxPrice": 12,
      "priceText": "Entry free for under 2; $8 adults, $12 with hayride.",
      "ticketRequired": false,
      "registrationRequired": false,
      "ticketUrl": "https://riversidefarm.example/tickets"
    },
    "audience": {
      "ageBands": [
        "baby",
        "toddler",
        "preschool",
        "school-age",
        "adult"
      ],
      "ageMin": 0,
      "familyFriendly": true,
      "strollerFriendly": true,
      "languages": [
        "en"
      ]
    },
    "organizer": {
      "name": "Riverside Farm",
      "url": "https://riversidefarm.example",
      "contact": "hello@riversidefarm.example"
    },
    "media": {
      "imageUrl": "https://riversidefarm.example/img/pumpkins.jpg",
      "imageAlt": "Children choosing pumpkins in a field"
    },
    "sources": [
      {
        "url": "https://riversidefarm.example/pumpkin-festival",
        "title": "Pumpkin Festival",
        "publisher": "Riverside Farm",
        "kind": "official",
        "retrievedAt": "2026-10-09T08:00:00-07:00"
      },
      {
        "url": "https://localevents.example/portland/pumpkin-festival",
        "title": "Riverside Family Pumpkin Festival",
        "publisher": "Local Events",
        "kind": "listing",
        "retrievedAt": "2026-10-09T08:05:00-07:00"
      }
    ],
    "status": "scheduled",
    "statusNote": "Rain or shine.",
    "updates": [
      {
        "at": "2026-10-09T08:00:00-07:00",
        "kind": "price-changed",
        "summary": "Adult entry raised by $2.",
        "field": "cost.maxPrice",
        "before": "$10",
        "after": "$12",
        "sourceUrl": "https://riversidefarm.example/pumpkin-festival"
      }
    ],
    "verification": {
      "lastCheckedAt": "2026-10-09T08:05:00-07:00",
      "lastChangedAt": "2026-10-09T08:00:00-07:00",
      "checkCount": 3,
      "confidence": 0.9
    },
    "firstSeenAt": "2026-09-20T08:00:00-07:00"
  },
  "whyForHousehold": "A relaxed outdoor Saturday close to home that the whole family can enjoy together.",
  "whyForChildren": "Hands-on pumpkin picking, animals and a costume parade suit toddlers through school age.",
  "highlights": [
    "Costume parade at noon",
    "Hayrides",
    "Petting corner"
  ],
  "tips": [
    "Arrive before 11 for easy parking",
    "Bring boots; fields can be muddy"
  ],
  "matchScore": 0.87,
  "matchReasons": [
    "Liked seasonal events",
    "Within 10 km",
    "Weekend morning"
  ],
  "distanceKm": 8.4,
  "travelMinutes": 18
}
```

## Interactions

- **Open an event:** tap a card on the overview. Back returns to the same scroll position and filters.
- **Respond:** one tap on Going, Interested or Not for us. The change shows immediately (optimistic), with a short confirmation. If it fails, the bar returns to its previous state with an error message and a retry.
- **Add to calendar:** a short sheet after Going or Interested: choose Shared or Private, choose the date if several, optional people and note. One primary button "Add to calendar". It should be possible to respond without adding to the calendar.
- **Change plan:** reopens the same sheet pre-filled.
- **Feedback:** one tap per pair, tap again to clear, optional reason field appears inline. No modal.
- **Filters:** category chips toggle; the response filter is single-choice; both combine. A "Clear filters" button appears when any filter is active. Filters are remembered for the session.
- **Agenda vs Month:** toggle at the top; selection is remembered.
- **Changed badge:** clears once the household has opened the event page.
- **Preferences:** changes save automatically with a visible "Saved" confirmation, or with an explicit Save button; the designer picks one and uses it consistently.
- **Consent:** the switch only turns on after the household has seen the full wording (it is always visible, so this is automatic). Turning off asks for confirmation.
- **Delete my event data:** two steps, button then confirmation dialog.
- **Keyboard and screen readers:** every control is reachable by keyboard, has a visible focus ring, and has an accessible label; statuses are announced in words, not colour.
- **Time:** "Today" and "Tomorrow" labels come from the household's local date and refresh at midnight without a reload.

## Visual language

- **Surfaces:** warm parchment page, cream cards with a thin warm border, generous padding. Dark mode uses the app's existing dark card and background tokens.
- **Headings:** serif (Source Serif 4) for page titles, event titles, day headings. Body in Inter. Dates, times and distances may use the mono face sparingly, as Satchel does.
- **Tiles:** tinted tiles (`SATCHEL_TONES`: `bg`, `fg`, `solid`) for "Why it suits you", "Why kids will love it", cost, distance and category. Use `MetricTile`-style tiles for the key facts at the top of the event page: When, Where, Cost, Ages.
- **Chips:** `ToneChip` for category, status, ages and tags. Pill shaped, 13px or larger, never smaller on wall displays.
- **Date badges:** `DateBadge` for agenda day headers and for the month view.
- **Icons:** the app's existing icon set only (lucide), each paired with a word.
- **Imagery:** no external photos. Cards are made from tone, icon, and typography.
- **Motion:** minimal and gentle; respect reduced-motion.
- **Contrast:** meet WCAG AA in both modes; check every tone pair (`fg` on `bg`) in light and dark.
- **Tone of voice:** warm, short, plain English. "Going" not "Confirm attendance". "Not for us" not "Reject".
- **Rules from the codebase:** colours are literal class strings from `SATCHEL_TONES` (never built at runtime); every light colour has a `dark:` pair; no hover-only information.

## Out of scope

- Any code or code changes; this brief is design input only.
- Photos or logos from third-party sites, and any third-party fonts, scripts or embedded maps (a plain link to open maps is fine).
- Ticket purchase or registration inside Family Frame; the app links out to `cost.ticketUrl` and `cost.registrationUrl`.
- Search, a free-text search box and a map view of events.
- Sharing events with other households, comments and social features.
- Operator-side screens: the local service that finds events, its schedule, its logs and its settings.
- Notifications and push alerts (a future addition).
- The Ask bar, "Needs you" card and other Satchel person-view features that have no Events data behind them.
- Editing or creating events by hand; events come only from the service.

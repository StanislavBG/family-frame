---
paths:
  - "server/**"
---
# Server rules

## Identity
- The client never sets identity headers. `createSessionHeaderMiddleware` (`server/auth.ts`) deletes client-sent x-clerk-user-id, x-clerk-username, x-ff-auth and x-ff-scopes on every request, then sets them only from a verified Clerk session cookie or a verified ff_pat_ token (ff_svc_ service tokens set only x-ff-auth=service).
- Handlers read x-clerk-user-id and answer 401 when it is missing.
- The auth middleware lives in `server/auth.ts`, not `server/middleware.ts`.

## Handlers
- `server/middleware.ts` holds the handler helpers: wrap every handler in asyncHandler, load users with getOrCreateUser, normalize Firebase arrays with toArray.
- Validate request bodies with Zod schemas from `shared/`.
- Outbound fetches of user-supplied URLs go through `server/url-guards.ts`.

## Routes
- Per-app routes live in server/apps/<id>.ts; every route module is registered from `server/routes.ts`.
- A route change updates the route inventory snapshot (`server/route-inventory.snapshot.json`): run `UPDATE_ROUTE_SNAPSHOT=1 npx tsx --test server/route-inventory.test.ts`, then commit the snapshot.

## Tests and data
- Server tests are node:test via tsx (server/*.test.ts), run by `npm test`.
- Local dev uses the production Firebase database, so tests and manual runs never write real data.

# Operations

The one place for environment variables, local development and the Replit deploy.
"Release" means `npm run release` to GitHub `main`; "deploy" means a human pulling `main` in
Replit's Git pane and clicking Publish.

## Environment variables

### Required

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key for the frontend (the server reads it too).
- `CLERK_SECRET_KEY`: Clerk secret key; the server verifies session JWTs with it.
- `FIREBASE_SERVICE_ACCOUNT`: Firebase service account key as JSON; all user data lives in the Realtime Database.

### Optional

- `APP_BASE_URL`: public base URL for OAuth redirects and the weather User-Agent; default `https://family-frame.replit.app` (`server/config.ts`).
- `SESSION_SECRET`: signs OAuth state (`server/oauth-state.ts`).
- `GOOGLE_CLIENT_ID`: Google Photos OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: Google Photos OAuth client secret.
- `PIXABAY_API_KEY`: enables the Pixabay photo source.
- `HOUSEHOLD_INBOX_ADDRESS`: operator Gmail inbox for household email; unset shows the feature as "not set up".
- `EVENTS_SERVICE_TOKEN_SHA256`: SHA-256 hex of the `ff_svc_` service token; unset disables the service API.
- `PUBLISHABLE_KEY_PROD`: server-side Clerk publishable key override for production.
- `PUBLISHABLE_KEY_DEV`: server-side Clerk publishable key override for development.

### Set by tooling

These are set by npm scripts, Replit or test commands, not by hand.

- `NODE_ENV`: set by the npm scripts (`development` for `npm run dev`).
- `PORT`: listen port; default 5000 (Replit sets it from `.replit`).
- `REPLIT_DEPLOYMENT`: `"1"` on Replit deployments; the server treats it as production.
- `REPL_ID`: set inside a Replit workspace; turns on the Replit dev plugins in `vite.config.ts`.
- `TZ`: used only by the client tests, to pin the time zone.
- `UPDATE_ROUTE_SNAPSHOT`: set to `1` to rewrite the route snapshot in `server/route-inventory.test.ts` (line 30).

Variables used only by the local services (the Events pipeline and mail intake) are documented
in `services/events-pipeline/README.md` and `docs/household-email.md`.

## Local development

- `npm run dev` starts Express and Vite on port 5000. It loads a local `.env` with `--env-file`
  when the file exists (`package.json` line 7).
- `.env` and `.env.*` are git-ignored (`.gitignore`). The GitHub repo is public: never commit them.
- Local dev uses the **production Firebase database**, so local writes change real data.
- Other commands: `npm run check` (types), `npm test` (vitest + node:test), `npm run build`.

## Deploy (Replit)

- Replit hosts the app as an autoscale deployment, configured in `.replit`:
  build `npm run build`, run `node ./dist/index.cjs`, port 5000.
- Secrets live only in Replit Secrets; never in the repo.
- To deploy, a human pulls `main` in Replit's Git pane and clicks Publish. Agents never do this step.

## Release

Releasing to GitHub `main` is the `builder` agent's job; see `.claude/agents/builder.md`.

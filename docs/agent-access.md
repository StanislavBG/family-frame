# Agent Access

How to let an AI agent (Claude Code or any MCP/HTTP client) manage your Family Frame calendar with a personal access token (PAT).

## 1. Create a token

1. Sign in to Family Frame and open **Settings → Agent Access**.
2. Click **New token**, name the agent (max 60 characters, e.g. "Claude Code on my laptop") and choose scopes.
3. Click **Create token**. The raw token (`ff_pat_...`) is shown **once**; copy it now. The dialog also shows a ready-made `claude mcp add` command.

You can hold at most 10 tokens per account.

## 2. Scopes

| Scope | Label in Settings | Grants |
| --- | --- | --- |
| `calendar:read` | Read calendar | Always included. `GET` on `/api/calendar/*`, `/api/people/list`, and the read-only MCP tools. |
| `calendar:write` | Create/edit/delete events | Non-`GET` calls on `/api/calendar/*` and the write MCP tools. |

## 3. Connect Claude Code

```bash
claude mcp add --transport http family-frame https://family-frame.replit.app/mcp --header "Authorization: Bearer ff_pat_..."
```

Replace `ff_pat_...` with your token. The MCP endpoint is stateless Streamable HTTP (`POST /mcp`; `GET`/`DELETE` return 405).

## 4. MCP tools

Dates are `YYYY-MM-DD`. `type` is `"Shared"` (visible to connected homes) or `"Private"`. `people` entries are person ids or names (case-insensitive); an unknown name returns an error listing the known people.

| Tool | Scope | Inputs |
| --- | --- | --- |
| `list_people` | `calendar:read` | none. Returns household members (id and name). |
| `list_events` | `calendar:read` | `from` (optional, date), `to` (optional, date). Returns own events plus Shared events from connected homes, filtered to those overlapping `from..to` inclusive. |
| `create_event` | `calendar:write` | `title` (required, non-empty string), `startDate` (required, date), `endDate` (optional, defaults to `startDate`), `type` (optional, default `Private`), `people` (optional, array of strings). |
| `update_event` | `calendar:write` | `eventId` (required, non-empty string), plus optional `title`, `startDate`, `endDate`, `type`, `people`. Provided fields are merged onto the existing event. Only your own events. |
| `delete_event` | `calendar:write` | `eventId` (required, non-empty string). Only your own events. |

A token without `calendar:write` gets an error result from the write tools.

## 5. REST example

```bash
curl -H "Authorization: Bearer ff_pat_..." https://family-frame.replit.app/api/calendar/events
```

PATs can reach only the paths in the allowlist (see Security).

## 6. Revocation

In **Settings → Agent Access**, click **Revoke** on the token and confirm. Access is lost immediately and this cannot be undone. The list shows each token's scopes, creation date and last use (updated at most hourly).

## 7. Security notes

- **Hash-only storage**: only the SHA-256 hash of a token is stored (Firebase `apiTokens/<hash>`); the raw token cannot be recovered, which is why it is shown once.
- **Path allowlist**: the PAT branch of the session-header middleware in `server/auth.ts` allows only `/api/calendar/*`, `/api/people/list`, `/mcp` and `/mcp/*`. Everything else returns 403. Non-`GET` calls on `/api/calendar/*` additionally require `calendar:write`.
- **Tokens cannot mint tokens**: `/api/tokens/*` is not on the allowlist, so a PAT cannot create, list or revoke tokens; that needs a signed-in browser session.
- Client-supplied identity headers are stripped; identity comes only from a verified Clerk session or PAT.
- Treat tokens like passwords: one per agent, revoke when unused.

## Roadmap

- OAuth 2.1 for claude.ai custom connectors, with Clerk as the authorization server.
- Non-calendar tools (messages, shopping list, notes, ...) behind new scopes.

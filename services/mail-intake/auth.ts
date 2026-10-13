// One-time loopback OAuth flow: authorizes the operator's Gmail inbox and saves a refresh token.
import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function buildConsentUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetch?: typeof fetch;
}): Promise<{ refresh_token: string }> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const res = await doFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { refresh_token?: unknown; error?: string };
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${body.error ?? ""}`.trim());
  if (typeof body.refresh_token !== "string" || !body.refresh_token) {
    throw new Error("Google returned no refresh_token; revoke the app's access in your Google account and retry");
  }
  return { refresh_token: body.refresh_token };
}

export interface AuthDeps {
  clientId: string;
  clientSecret: string;
  tokenFile: string;
  out?: (line: string) => void;
  err?: (line: string) => void;
  fetch?: typeof fetch;
  exchange?: typeof exchangeCode;
  now?: () => Date;
  timeoutMs?: number;
  state?: string;
}

function page(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Family Frame inbox</title><p>${message}</p>`;
}

/** Resolves to the process exit code: 0 saved, 1 failed or timed out. */
export function runAuth(deps: AuthDeps): Promise<number> {
  const out = deps.out ?? ((s: string) => console.log(s));
  const err = deps.err ?? ((s: string) => console.error(s));
  const exchange = deps.exchange ?? exchangeCode;
  const now = deps.now ?? (() => new Date());
  const state = deps.state ?? randomBytes(16).toString("hex");
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<number>((resolve) => {
    let redirectUri = "";
    let handling = false;
    let finished = false;
    let timer: NodeJS.Timeout | undefined;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const reply = (status: number, message: string) => {
        res.writeHead(status, { "content-type": "text/html; charset=utf-8", connection: "close" });
        res.end(page(message));
      };
      if (req.method !== "GET" || url.pathname !== "/callback") return reply(404, "Not found");
      if (url.searchParams.get("state") !== state) return reply(400, "State mismatch. Use the link printed in the terminal.");
      if (handling) return reply(409, "Already handled.");
      handling = true;

      const code = url.searchParams.get("code");
      const denied = url.searchParams.get("error");
      if (denied || !code) {
        reply(400, "Authorization was not granted. You can close this tab.");
        return finish(1, `authorization failed: ${denied ?? "no code returned"}`);
      }
      exchange({ clientId: deps.clientId, clientSecret: deps.clientSecret, code, redirectUri, fetch: deps.fetch })
        .then(async ({ refresh_token }) => {
          await mkdir(dirname(deps.tokenFile), { recursive: true });
          await writeFile(deps.tokenFile, JSON.stringify({ refresh_token, created_at: now().toISOString() }), {
            mode: 0o600,
          });
          await chmod(deps.tokenFile, 0o600);
          reply(200, "Done. You can close this tab.");
          finish(0, `saved refresh token to ${deps.tokenFile}`);
        })
        .catch((e: unknown) => {
          reply(500, "Something went wrong. Check the terminal.");
          finish(1, `auth failed: ${e instanceof Error ? e.message : String(e)}`);
        });
    });

    function finish(code: number, message: string) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      (code === 0 ? out : err)(message);
      server.close(() => resolve(code));
      server.closeAllConnections();
    }

    server.on("error", (e) => finish(1, `auth server error: ${e.message}`));
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
      out("Open this URL in a browser and approve access:");
      out(buildConsentUrl({ clientId: deps.clientId, redirectUri, state }));
      timer = setTimeout(() => finish(1, "timed out waiting for authorization"), timeoutMs);
    });
  });
}

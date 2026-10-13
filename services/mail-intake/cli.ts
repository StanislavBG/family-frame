import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runAuth } from "./auth";
import { createInboxFfClient } from "./ff-inbox-client";
import { createGmailClient, GmailAuthError } from "./gmail";
import { runOnce } from "./run";

export interface CliConfig {
  baseUrl: string;
  token: string;
  inboxAddress: string;
  clientId: string;
  clientSecret: string;
  tokenFile: string;
}

export interface CliDeps {
  env?: NodeJS.ProcessEnv;
  loadEnvFile?: (path: string) => void;
  readFile?: (path: string) => string;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

const REQUIRED = [
  ["FF_BASE_URL", "baseUrl"],
  ["FF_SERVICE_TOKEN", "token"],
  ["INBOX_ADDRESS", "inboxAddress"],
  ["INBOX_GMAIL_CLIENT_ID", "clientId"],
  ["INBOX_GMAIL_CLIENT_SECRET", "clientSecret"],
  ["INBOX_GMAIL_TOKEN_FILE", "tokenFile"],
] as const;

/** Returns the first problem as a one-line message. */
export function readConfig(env: NodeJS.ProcessEnv): CliConfig | string {
  const cfg: Record<string, string> = {};
  for (const [name, key] of REQUIRED) {
    const value = env[name]?.trim() ?? "";
    if (!value) return `missing config: ${name}`;
    cfg[key] = value;
  }
  return cfg as unknown as CliConfig;
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.out ?? ((s: string) => console.log(s));
  const err = deps.err ?? ((s: string) => console.error(s));
  const command = argv[0] ?? "run";

  switch (command) {
    case "run":
      return runCommand(deps, out, err);
    case "auth":
      return authCommand(deps, out, err);
    default:
      err(`unknown command: ${command}\nusage: cli.ts [run|auth]`);
      return 2;
  }
}

async function authCommand(deps: CliDeps, out: (s: string) => void, err: (s: string) => void): Promise<number> {
  const env = deps.env ?? process.env;
  const clientId = env.INBOX_GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.INBOX_GMAIL_CLIENT_SECRET?.trim() ?? "";
  const tokenFile = env.INBOX_GMAIL_TOKEN_FILE?.trim() ?? "";
  for (const [name, value] of [
    ["INBOX_GMAIL_CLIENT_ID", clientId],
    ["INBOX_GMAIL_CLIENT_SECRET", clientSecret],
    ["INBOX_GMAIL_TOKEN_FILE", tokenFile],
  ]) {
    if (!value) {
      err(`missing config: ${name}`);
      return 2;
    }
  }
  return runAuth({ clientId, clientSecret, tokenFile, out, err });
}

async function runCommand(deps: CliDeps, out: (s: string) => void, err: (s: string) => void): Promise<number> {
  const env = deps.env ?? process.env;
  const envFile = env.INBOX_ENV_FILE?.trim();
  if (envFile) {
    try {
      (deps.loadEnvFile ?? ((p: string) => process.loadEnvFile(p)))(envFile);
    } catch {
      err("cannot read the file named by INBOX_ENV_FILE");
      return 2;
    }
  }

  const cfg = readConfig(env);
  if (typeof cfg === "string") {
    err(cfg);
    return 2;
  }

  let refreshToken: string;
  try {
    const parsed = JSON.parse((deps.readFile ?? ((p: string) => readFileSync(p, "utf8")))(cfg.tokenFile)) as {
      refresh_token?: unknown;
    };
    if (typeof parsed.refresh_token !== "string" || !parsed.refresh_token) throw new Error("no refresh_token");
    refreshToken = parsed.refresh_token;
  } catch {
    err("cannot read a refresh_token from the file named by INBOX_GMAIL_TOKEN_FILE");
    return 2;
  }

  try {
    const ff = createInboxFfClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    const gmail = createGmailClient({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken });
    const summary = await runOnce({ gmail, ff, base: cfg.inboxAddress, log: err });
    out(JSON.stringify(summary));
    return 0;
  } catch (e) {
    err(e instanceof GmailAuthError ? e.message : `mail-intake failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";
import { getAppBaseUrl } from "../server/config";

export const BILKO_SLUG = "family-frame";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OG_SOURCE = path.join(REPO_ROOT, "bilko", "og.png");
const ICON_SOURCE = path.join(REPO_ROOT, "client", "public", "favicon.png");

export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readSource(file: string): Buffer {
  if (!existsSync(file)) throw new Error(`bilko-bundle: missing ${file}`);
  return readFileSync(file);
}

export interface ManifestInput {
  version: string;
  builtAt: string;
  gitSha: string;
  gitBranch: string;
  files: Array<{ name: string; content: string | Buffer }>;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderRedirectPage(targetUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error(`bilko-bundle: target is not a valid URL: ${JSON.stringify(targetUrl)}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`bilko-bundle: target must be an https:// URL, got ${JSON.stringify(targetUrl)}`);
  }
  const target = escapeAttr(targetUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Family Frame</title>
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
</head>
<body>
<main>
<h1>Family Frame</h1>
<p>Opening Family Frame…</p>
<p><a href="${target}">Open Family Frame</a></p>
</main>
</body>
</html>
`;
}

export function buildManifest(input: ManifestInput) {
  const sizeBytesGz = input.files.reduce((sum, f) => sum + gzipSync(f.content).length, 0);
  return {
    schemaVersion: 1,
    slug: BILKO_SLUG,
    version: input.version,
    builtAt: input.builtAt,
    gitSha: input.gitSha,
    gitBranch: input.gitBranch,
    hostKit: { version: "0.0.0" },
    golden: { path: `/projects/${BILKO_SLUG}/`, expect: "Family Frame" },
    health: {},
    bundle: { sizeBytesGz, fileCount: input.files.length },
  };
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function buildBilkoBundle(outDir: string, targetUrl: string = getAppBaseUrl() + "/") {
  const html = renderRedirectPage(targetUrl);
  const og = readSource(OG_SOURCE);
  const icon = readSource(ICON_SOURCE);
  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { version?: string };
  const manifest = buildManifest({
    version: pkg.version ?? "0.0.0",
    builtAt: new Date().toISOString(),
    gitSha: git(["rev-parse", "--short", "HEAD"]),
    gitBranch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    files: [
      { name: "index.html", content: html },
      { name: "og.png", content: og },
      { name: "icon.png", content: icon },
    ],
  });
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  if (Buffer.byteLength(manifestJson) >= 16 * 1024) throw new Error("bilko-bundle: manifest exceeds 16 KB");

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), html);
  writeFileSync(path.join(outDir, "og.png"), og);
  writeFileSync(path.join(outDir, "icon.png"), icon);
  writeFileSync(path.join(outDir, "manifest.json"), manifestJson);
  return { manifest, targetUrl, files: readdirSync(outDir).sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { manifest, targetUrl } = buildBilkoBundle(path.resolve("bilko-dist"));
    console.log(`bilko-bundle: ${BILKO_SLUG} ${manifest.version} (${manifest.gitSha}) -> ${targetUrl}`);
  } catch (e) {
    console.error(`bilko-bundle: ${(e as Error).message}`);
    process.exit(1);
  }
}

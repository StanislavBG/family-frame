// Plain-JS launcher for the events pipeline: bundles cli.ts with esbuild into a
// gitignored cache once, reuses it while no input changed, and runs it in this
// process. Saves the TypeScript loader start-up (~0.4-0.5 s CPU) on every tick.
// Node 22 only. esbuild is loaded only when a rebuild is needed.
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), "..", "..");
const ENTRY = join(ROOT, "services", "events-pipeline", "cli.ts");
export const DEFAULT_OUT_FILE = join(ROOT, ".cache", "events-pipeline", "cli.mjs");

function mtimeOf(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

/** True when the bundle at outFile is present and newer than every recorded input and this launcher. */
function isFresh(outFile, metaFile) {
  const bundleMtime = mtimeOf(outFile);
  if (bundleMtime === undefined) return false;
  const selfMtime = mtimeOf(SELF);
  if (selfMtime === undefined || selfMtime > bundleMtime) return false;
  let inputs;
  try {
    inputs = Object.keys(JSON.parse(readFileSync(metaFile, "utf8")).inputs ?? {});
  } catch {
    return false;
  }
  if (inputs.length === 0) return false;
  for (const input of inputs) {
    const m = mtimeOf(resolve(ROOT, input));
    if (m === undefined || m > bundleMtime) return false;
  }
  return true;
}

/**
 * Make sure the bundle at outFile is current; rebuild it with esbuild only when it is
 * missing or stale. Resolves to { outFile, built }.
 */
export async function ensureBundle({ outFile = DEFAULT_OUT_FILE } = {}) {
  const metaFile = `${outFile}.meta.json`;
  if (isFresh(outFile, metaFile)) return { outFile, built: false };
  mkdirSync(dirname(outFile), { recursive: true });
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [ENTRY],
    outfile: outFile,
    absWorkingDir: ROOT,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    metafile: true,
    logLevel: "warning",
  });
  writeFileSync(metaFile, JSON.stringify(result.metafile));
  return { outFile, built: true };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const { outFile } = await ensureBundle();
  const { main } = await import(`${pathToFileURL(outFile).href}?v=${statSync(outFile).mtimeMs}`);
  process.exit(await main(process.argv.slice(2)));
}

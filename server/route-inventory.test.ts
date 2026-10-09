import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "http";
import { registerRoutes } from "./routes";

const SNAPSHOT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "route-inventory.snapshot.json");

async function collectRoutes(): Promise<string[]> {
  const entries: string[] = [];
  const recorder: any = {};
  for (const method of ["get", "post", "put", "patch", "delete", "all", "use"]) {
    recorder[method] = (first: unknown) => {
      if (method === "use") {
        entries.push(typeof first === "string" ? `USE ${first}` : "USE *");
      } else {
        entries.push(`${method.toUpperCase()} ${typeof first === "string" ? first : String(first)}`);
      }
      return recorder;
    };
  }
  await registerRoutes({} as Server, recorder);
  return entries;
}

test("route inventory: ordered METHOD+path list is unchanged", async () => {
  const routes = await collectRoutes();
  if (process.env.UPDATE_ROUTE_SNAPSHOT === "1") {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(routes, null, 2) + "\n");
    return;
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(routes, expected);
});

test("route inventory: no duplicate METHOD+path entries", async () => {
  const routes = await collectRoutes();
  const dupes = routes.filter((r, i) => routes.indexOf(r) !== i);
  assert.deepEqual(dupes, []);
});

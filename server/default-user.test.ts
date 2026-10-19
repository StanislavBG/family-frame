import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDefaultUserData } from "./default-user";
import { userSettingsSchema, withSettingsDefaults } from "../shared/schema";
import { DEFAULT_VISIBLE_APP_IDS, DEFAULT_APP_ORDER, resolveAppLayout } from "../shared/apps";

const data = getDefaultUserData("user_1", "alice");

test("identity and non-settings fields are empty seeds", () => {
  assert.equal(data.clerkId, "user_1");
  assert.equal(data.username, "alice");
  assert.deepEqual(data.people, []);
  assert.deepEqual(data.events, []);
  assert.deepEqual(data.connections, []);
  assert.deepEqual(data.connectionRequests, []);
  assert.deepEqual(data.notes, []);
  assert.deepEqual(data.messages, []);
});

test("visibleApps and appOrder come from the manifest", () => {
  assert.deepEqual(data.settings.visibleApps, DEFAULT_VISIBLE_APP_IDS);
  assert.deepEqual(data.settings.appOrder, DEFAULT_APP_ORDER);
});

test("new accounts see only the short default menu", () => {
  const ids = resolveAppLayout(data.settings).menu.map((a) => a.id);
  assert.deepEqual(ids, ["home", "settings", "clock", "weather"]);
});

test("seeded settings hold exactly the household keys and the app list", () => {
  assert.deepEqual(Object.keys(data.settings).sort(), ["appOrder", "homeName", "location", "visibleApps"]);
  assert.equal(data.settings.homeName, "");
  assert.deepEqual(data.settings.location, { city: "", country: "" });
});

test("defaults on read equal the old fully-parsed seed", () => {
  const oldSeed = userSettingsSchema.parse({
    homeName: "",
    location: { city: "", country: "" },
    visibleApps: [...DEFAULT_VISIBLE_APP_IDS],
    appOrder: [...DEFAULT_APP_ORDER],
  });
  assert.deepEqual(withSettingsDefaults(data.settings), oldSeed);
});

test("default-user does not hard-code per-app settings", () => {
  const src = readFileSync(new URL("./default-user.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /radioStation|trackedStocks|userSettingsSchema/);
});

test("getOrCreateUser only seeds when no user exists", () => {
  const src = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!userData\) \{\s*userData = getDefaultUserData\(clerkId, username\);/);
  assert.doesNotMatch(src, /function getDefaultUserData/);
});

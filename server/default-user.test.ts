import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDefaultUserData } from "./default-user";
import { userSettingsSchema } from "../shared/schema";
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
  assert.deepEqual(ids, ["home", "settings", "calendar", "weather", "clock", "messages", "photos"]);
});

test("settings satisfy the schema with schema defaults", () => {
  assert.equal(userSettingsSchema.safeParse(data.settings).success, true);
  assert.equal(data.settings.photoSource, "pixabay");
  assert.deepEqual(data.settings.trackedStocks, userSettingsSchema.parse({}).trackedStocks);
  assert.equal(data.settings.homeName, "");
  assert.deepEqual(data.settings.location, { city: "", country: "" });
});

test("getOrCreateUser only seeds when no user exists", () => {
  const src = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!userData\) \{\s*userData = getDefaultUserData\(clerkId, username\);/);
  assert.doesNotMatch(src, /function getDefaultUserData/);
});

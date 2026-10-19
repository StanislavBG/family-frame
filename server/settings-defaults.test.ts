import { test } from "node:test";
import assert from "node:assert/strict";
import {
  userSettingsSchema,
  SETTINGS_DEFAULTS,
  withSettingsDefaults,
  HOUSEHOLD_SETTINGS_KEYS,
  APP_SETTINGS_KEYS,
} from "../shared/schema";

test("every settings key is owned exactly once", () => {
  const owned: string[] = [...HOUSEHOLD_SETTINGS_KEYS];
  for (const keys of Object.values(APP_SETTINGS_KEYS)) owned.push(...(keys ?? []));
  const counts = new Map<string, number>();
  for (const k of owned) counts.set(k, (counts.get(k) ?? 0) + 1);
  const schemaKeys = Object.keys(userSettingsSchema.shape);
  for (const k of schemaKeys) assert.equal(counts.get(k), 1, `${k} must be owned exactly once`);
  for (const k of counts.keys()) assert.ok(schemaKeys.includes(k), `${k} is not a settings key`);
});

test("withSettingsDefaults({}) equals SETTINGS_DEFAULTS", () => {
  assert.deepEqual(withSettingsDefaults({}), SETTINGS_DEFAULTS);
});

test("non-object input yields defaults", () => {
  for (const v of [null, undefined, "x", 5, [1, 2]]) {
    assert.deepEqual(withSettingsDefaults(v), SETTINGS_DEFAULTS);
  }
});

test("stored values win", () => {
  const s = withSettingsDefaults({ radioVolume: 80, homeName: "Home", babySongsShuffleEnabled: false });
  assert.equal(s.radioVolume, 80);
  assert.equal(s.homeName, "Home");
  assert.equal(s.tvVolume, SETTINGS_DEFAULTS.tvVolume);
});

test("null and undefined stored values are ignored", () => {
  const s = withSettingsDefaults({ radioVolume: null, tvVolume: undefined });
  assert.equal(s.radioVolume, SETTINGS_DEFAULTS.radioVolume);
  assert.equal(s.tvVolume, SETTINGS_DEFAULTS.tvVolume);
});

test("out-of-range legacy values are kept, not thrown", () => {
  assert.equal(withSettingsDefaults({ photoInterval: 999 }).photoInterval, 999);
});

test("does not mutate SETTINGS_DEFAULTS", () => {
  const before = JSON.stringify(SETTINGS_DEFAULTS);
  withSettingsDefaults({ radioVolume: 1 });
  assert.equal(JSON.stringify(SETTINGS_DEFAULTS), before);
});

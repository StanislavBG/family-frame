import { test } from "node:test";
import assert from "node:assert/strict";
import { updateUserSettingsSchema, updatePersonSchema, isValidConnectionUserId } from "../shared/schema";

test("settings: accepts partial valid bodies", () => {
  assert.equal(updateUserSettingsSchema.safeParse({}).success, true);
  assert.equal(updateUserSettingsSchema.safeParse({ radioVolume: 30, temperatureUnit: "fahrenheit" }).success, true);
  assert.equal(
    updateUserSettingsSchema.safeParse({ radioStation: "https://example.com/a.aac", radioEnabled: true }).success,
    true,
  );
});

test("settings: does not inject defaults for omitted keys", () => {
  assert.deepEqual(updateUserSettingsSchema.parse({ radioVolume: 10 }), { radioVolume: 10 });
});

test("settings: rejects bad shapes", () => {
  for (const body of [
    { trackedStocks: "DJI" },
    { visibleApps: { a: 1 } },
    { radioVolume: 500 },
    { temperatureUnit: "kelvin" },
    { radioStation: "javascript:alert(1)" },
    { radioStation: "file:///etc/passwd" },
    { radioStation: "not a url" },
  ]) {
    assert.equal(updateUserSettingsSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("settings: rejects server-owned and unknown keys", () => {
  for (const key of ["selectedPhotos", "pickerSessionId", "googlePhotosConnected", "googleTokens", "bogus"]) {
    assert.equal(updateUserSettingsSchema.safeParse({ [key]: key === "selectedPhotos" ? [] : "x" }).success, false, key);
  }
});

test("person: accepts partial valid updates", () => {
  assert.equal(updatePersonSchema.safeParse({ name: "Ana" }).success, true);
  assert.equal(updatePersonSchema.safeParse({ birthday: "2020-01-31" }).success, true);
  assert.equal(updatePersonSchema.safeParse({}).success, true);
});

test("person: rejects bad birthday, empty name, extra keys", () => {
  assert.equal(updatePersonSchema.safeParse({ birthday: "01/31/2020" }).success, false);
  assert.equal(updatePersonSchema.safeParse({ birthday: "2020-1-3" }).success, false);
  assert.equal(updatePersonSchema.safeParse({ name: "" }).success, false);
  assert.equal(updatePersonSchema.safeParse({ name: "A", id: "other" }).success, false);
});

test("connection id guard", () => {
  assert.equal(isValidConnectionUserId("user_2abcDEF123"), true);
  for (const bad of ["", "user_", "users/abc", "user_a/b", "user_a.b", "../x", "abc", "user_a b", undefined, 5]) {
    assert.equal(isValidConnectionUserId(bad), false, String(bad));
  }
});

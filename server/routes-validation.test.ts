import { test } from "node:test";
import assert from "node:assert/strict";
import { updateUserSettingsSchema, updatePersonSchema, isValidConnectionUserId, saveShoppingListSchema, saveChoresSchema, saveRecipesSchema, createPlaylistSchema, updatePlaylistSchema, insertMessageSchema } from "../shared/schema";

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

test("shopping: valid list, empty list, rejects undefined and oversized", () => {
  const item = { id: "1", name: "Milk", aisle: "dairy", checked: false };
  assert.equal(saveShoppingListSchema.safeParse([item]).success, true);
  assert.equal(saveShoppingListSchema.safeParse([]).success, true);
  assert.equal(saveShoppingListSchema.safeParse(undefined).success, false);
  assert.equal(saveShoppingListSchema.safeParse([{ ...item, name: "x".repeat(201) }]).success, false);
  assert.equal(saveShoppingListSchema.safeParse(Array(1001).fill(item)).success, false);
});

test("chores: valid, empty, missing and malformed", () => {
  const chore = { id: "c1", title: "Dishes", createdAt: "2024-01-01T00:00:00Z" };
  assert.equal(saveChoresSchema.safeParse([chore]).success, true);
  assert.equal(saveChoresSchema.safeParse([]).success, true);
  assert.equal(saveChoresSchema.safeParse(undefined).success, false);
  assert.equal(saveChoresSchema.safeParse([{ ...chore, priority: "urgent" }]).success, false);
  assert.equal(saveChoresSchema.safeParse(Array(1001).fill(chore)).success, false);
});

test("recipes: valid, empty, missing and oversized", () => {
  const recipe = { id: "r1", title: "Soup", createdAt: "a", updatedAt: "b" };
  assert.equal(saveRecipesSchema.safeParse([recipe]).success, true);
  assert.equal(saveRecipesSchema.safeParse([]).success, true);
  assert.equal(saveRecipesSchema.safeParse(undefined).success, false);
  assert.equal(saveRecipesSchema.safeParse(Array(501).fill(recipe)).success, false);
});

test("playlist: create validates, PATCH strips id and createdAt", () => {
  assert.equal(createPlaylistSchema.safeParse({ name: "Hits", videoIds: ["abc"] }).success, true);
  assert.equal(createPlaylistSchema.safeParse({}).success, false);
  assert.equal(createPlaylistSchema.safeParse({ name: "x", videoIds: "abc" }).success, false);
  assert.equal(createPlaylistSchema.safeParse({ name: "x".repeat(101), videoIds: [] }).success, false);
  const out = updatePlaylistSchema.parse({ name: "New", id: "evil", createdAt: "1970", updatedAt: "1970" });
  assert.deepEqual(out, { name: "New" });
  assert.equal(updatePlaylistSchema.safeParse({}).success, true);
});

test("message: limits content, strips client toUsername, keeps linkedEventId", () => {
  const ok = insertMessageSchema.parse({ toUserId: "u2", toUsername: "spoof", content: "hi", linkedEventId: "e1" });
  assert.deepEqual(ok, { toUserId: "u2", content: "hi", linkedEventId: "e1" });
  assert.equal(insertMessageSchema.safeParse({ toUserId: "u2", content: "x".repeat(2000) }).success, true);
  assert.equal(insertMessageSchema.safeParse({ toUserId: "u2", content: "x".repeat(2001) }).success, false);
  assert.equal(insertMessageSchema.safeParse({ toUserId: "u2", content: "" }).success, false);
});

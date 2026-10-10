import { describe, it, expect } from "vitest";
import {
  APP_IDS,
  APP_MANIFESTS,
  DEFAULT_APP_ORDER,
  DEFAULT_VISIBLE_APP_IDS,
  getAppManifest,
  isAppEnabled,
  moveAppInOrder,
  normalizeAppOrder,
  resolveAppLayout,
  setAppEnabled,
} from "@shared/apps";
import { updateUserSettingsSchema, defaultAppList } from "@shared/schema";

const MOVABLE = APP_MANIFESTS.filter((a) => !a.fixed).map((a) => a.id);

describe("app manifest", () => {
  it("has unique ids equal to APP_IDS and unique urls", () => {
    const ids = APP_MANIFESTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...APP_IDS]);
    expect(ids).toHaveLength(18);
    const urls = APP_MANIFESTS.map((a) => a.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("has overview copy for every non-fixed app", () => {
    for (const app of APP_MANIFESTS.filter((a) => !a.fixed)) {
      expect(app.summary.length, app.id).toBeGreaterThan(0);
      expect(app.description.length, app.id).toBeGreaterThan(0);
      expect(app.features.length, app.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("defaults", () => {
    const on = APP_MANIFESTS.filter((a) => a.defaultEnabled).map((a) => a.id).sort();
    expect(on).toEqual(["calendar", "clock", "home", "messages", "photos", "settings", "weather"]);
    expect([...DEFAULT_VISIBLE_APP_IDS].sort()).toEqual(on);
    expect(DEFAULT_APP_ORDER).toEqual([
      "calendar", "weather", "clock", "messages", "photos", "people", "radio", "baby-songs", "tv",
      "stocks", "chores", "recipes", "notepad", "shopping", "screensaver",
    ]);
  });

  it("registers people as an optional, movable app", () => {
    const people = getAppManifest("people");
    expect(people.url).toBe("/people");
    expect(people.defaultEnabled).toBe(false);
    expect(people.fixed).toBeFalsy();
  });

  it("registers events as an optional, movable, nested app after calendar", () => {
    const events = getAppManifest("events");
    expect(events.title).toBe("Events");
    expect(events.url).toBe("/events");
    expect(events.defaultEnabled).toBe(false);
    expect(events.fixed).toBeFalsy();
    expect(events.nested).toBe(true);
    expect(getAppManifest("people").nested).toBe(true);
    expect(getAppManifest("calendar").nested).toBeFalsy();
    expect(APP_IDS.indexOf("events")).toBe(APP_IDS.indexOf("calendar") + 1);
  });

  it("derives defaultAppList from the manifest", () => {
    expect(defaultAppList.map((a) => a.id)).toEqual([...APP_IDS]);
    expect(defaultAppList[0]).toEqual({ id: "home", title: "Home", url: "/", fixed: true });
    expect(defaultAppList.find((a) => a.id === "photos")).toEqual({ id: "photos", title: "Picture Frame", url: "/photos" });
    expect(getAppManifest("tv").title).toBe("World TV");
  });

  it("legacy undefined settings enable every app", () => {
    for (const s of [undefined, null, {}]) {
      const layout = resolveAppLayout(s);
      expect(layout.enabledIds).toHaveLength(18);
      expect(layout.menu).toHaveLength(18);
      expect(isAppEnabled(s, "tv")).toBe(true);
    }
  });

  it("respects explicit visibleApps and ignores unknown ids", () => {
    const layout = resolveAppLayout({ visibleApps: ["clock", "dashboard", "tv"] });
    expect(layout.enabledIds.sort()).toEqual(["clock", "home", "settings", "tv"]);
    expect(layout.menu.map((a) => a.id)).toEqual(["home", "settings", "clock", "tv"]);
    expect(isAppEnabled({ visibleApps: ["clock"] }, "weather")).toBe(false);
    expect(isAppEnabled({ visibleApps: [] }, "home")).toBe(true);
  });

  it("menu follows appOrder", () => {
    const layout = resolveAppLayout({ visibleApps: ["clock", "tv"], appOrder: ["tv", "clock"] });
    expect(layout.menu.map((a) => a.id)).toEqual(["home", "settings", "tv", "clock"]);
    expect(layout.movable.find((m) => m.app.id === "weather")?.enabled).toBe(false);
  });

  it("normalizeAppOrder appends missing and drops unknown/duplicates", () => {
    expect(normalizeAppOrder(undefined)).toEqual(MOVABLE);
    const out = normalizeAppOrder(["tv", "bogus", "tv", "home", "clock"]);
    expect(out.slice(0, 2)).toEqual(["tv", "clock"]);
    expect(out).toHaveLength(MOVABLE.length);
    expect(new Set(out).size).toBe(out.length);
  });

  it("moveAppInOrder", () => {
    const base = normalizeAppOrder(undefined);
    const down = moveAppInOrder(base, base[0], "down");
    expect(down.slice(0, 2)).toEqual([base[1], base[0]]);
    const up = moveAppInOrder(base, base[1], "up");
    expect(up.slice(0, 2)).toEqual([base[1], base[0]]);
    expect(moveAppInOrder(base, base[0], "up")).toEqual(base);
    expect(moveAppInOrder(base, base[base.length - 1], "down")).toEqual(base);
    expect(moveAppInOrder(base, "home", "down")).toEqual(base);
    expect(moveAppInOrder(base, "nope" as never, "down")).toEqual(base);
  });

  it("setAppEnabled", () => {
    expect(setAppEnabled(["clock", "dashboard", "clock"], "tv", true)).toEqual(["home", "settings", "clock", "tv"]);
    expect(setAppEnabled(undefined, "tv", false)).not.toContain("tv");
    expect(setAppEnabled(undefined, "tv", false)).toHaveLength(17);
    expect(setAppEnabled(["clock"], "clock", false)).toEqual(["home", "settings"]);
    expect(setAppEnabled(["clock"], "home", false)).toEqual(["home", "settings", "clock"]);
    expect(setAppEnabled([], "dashboard" as never, true)).toEqual(["home", "settings"]);
    const all = setAppEnabled(undefined, "clock", true);
    expect(all).toEqual([...APP_IDS]);
  });

  it("bounds visibleApps in the update schema", () => {
    const ids51 = Array.from({ length: 51 }, (_, i) => `app${i}`);
    expect(updateUserSettingsSchema.safeParse({ visibleApps: ids51 }).success).toBe(false);
    const ids17 = [...APP_IDS, "dashboard"];
    expect(updateUserSettingsSchema.safeParse({ visibleApps: ids17 }).success).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  APP_CATEGORIES,
  APP_IDS,
  APP_NEED_COPY,
  appNeedStatus,
  type AppNeed,
  type AppNeedFacts,
  APP_MANIFESTS,
  applyStarterPack,
  STARTER_PACKS,
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
    expect(ids).toHaveLength(19);
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
    expect(on).toEqual(["clock", "home", "settings", "weather"]);
    expect([...DEFAULT_VISIBLE_APP_IDS].sort()).toEqual(on);
    expect(DEFAULT_APP_ORDER).toEqual([
      "clock", "weather", "calendar", "messages", "photos", "people", "radio", "baby-songs", "tv",
      "stocks", "chores", "recipes", "notepad", "shopping", "screensaver",
    ]);
  });

  it("has the four starter packs", () => {
    expect(STARTER_PACKS.map((p) => p.id)).toEqual(["kitchen", "grandparents", "organiser", "frame"]);
    const byId = (id: string) => STARTER_PACKS.find((p) => p.id === id)!.appIds;
    expect(byId("kitchen")).toEqual(["clock", "weather", "calendar", "photos", "shopping", "screensaver"]);
    expect(byId("grandparents")).toEqual(["clock", "weather", "photos", "messages", "screensaver"]);
    expect(byId("organiser")).toEqual(["calendar", "chores", "shopping", "recipes", "notepad", "people"]);
    expect(byId("frame")).toEqual(["photos", "clock", "screensaver"]);
    for (const p of STARTER_PACKS) {
      expect(p.title.length, p.id).toBeGreaterThan(0);
      expect(p.description.length, p.id).toBeGreaterThan(0);
    }
  });

  it("starter pack apps are real, non-fixed apps", () => {
    for (const p of STARTER_PACKS) {
      for (const id of p.appIds) {
        const m = APP_MANIFESTS.find((a) => a.id === id);
        expect(m, `${p.id}:${id}`).toBeDefined();
        expect(m!.fixed, `${p.id}:${id}`).toBeFalsy();
      }
    }
  });

  it("applyStarterPack add keeps current apps and adds the pack", () => {
    expect(applyStarterPack(["clock", "weather"], "frame", "add")).toEqual(["home", "settings", "clock", "weather", "photos", "screensaver"]);
    expect(applyStarterPack(["clock", "tv"], "grandparents", "add")).toEqual(
      ["home", "settings", "clock", "weather", "photos", "messages", "tv", "screensaver"],
    );
  });

  it("applyStarterPack replace drops current apps", () => {
    expect(applyStarterPack(["clock", "weather", "tv"], "frame", "replace")).toEqual(["home", "settings", "clock", "photos", "screensaver"]);
    for (const p of STARTER_PACKS) {
      const out = applyStarterPack(["tv"], p.id, "replace")!;
      expect(out).toEqual(expect.arrayContaining(["home", "settings", ...p.appIds]));
      expect(out).not.toContain("tv");
      expect(out).toHaveLength(2 + p.appIds.length);
    }
  });

  it("applyStarterPack treats missing visibleApps as all apps on (add) and ignores it (replace)", () => {
    for (const v of [undefined, null]) {
      expect(applyStarterPack(v, "frame", "add")).toEqual([...APP_IDS]);
      expect(applyStarterPack(v, "frame", "replace")).toEqual(["home", "settings", "clock", "photos", "screensaver"]);
    }
  });

  it("applyStarterPack returns null for an unknown pack", () => {
    expect(applyStarterPack(["clock"], "nope", "add")).toBeNull();
    expect(applyStarterPack(["clock"], "nope", "replace")).toBeNull();
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
    expect(getAppManifest("calendar").nested).toBe(true);
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
      expect(layout.enabledIds).toHaveLength(19);
      expect(layout.menu).toHaveLength(19);
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
    expect(setAppEnabled(undefined, "tv", false)).toHaveLength(18);
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

describe("app categories and needs", () => {
  it("puts every app in a known category", () => {
    expect(APP_CATEGORIES.map((c) => c.title)).toEqual(["Everyday", "Family & home", "Listen & watch", "Money & bills"]);
    const ids = APP_CATEGORIES.map((c) => c.id);
    for (const app of APP_MANIFESTS) expect(ids, app.id).toContain(app.category);
  });

  it("has copy with an in-app href for every need", () => {
    const needs: AppNeed[] = ["location", "people", "connections", "agent", "address"];
    expect(Object.keys(APP_NEED_COPY).sort()).toEqual([...needs].sort());
    for (const need of needs) {
      expect(APP_NEED_COPY[need].label.length, need).toBeGreaterThan(0);
      expect(APP_NEED_COPY[need].howTo.length, need).toBeGreaterThan(0);
      expect(APP_NEED_COPY[need].href.startsWith("/"), need).toBe(true);
    }
  });

  it("maps needs for the apps that have them", () => {
    expect(getAppManifest("weather").needs).toEqual(["location"]);
    expect(getAppManifest("people").needs).toEqual(["people"]);
    expect(getAppManifest("messages").needs).toEqual(["connections"]);
    expect(getAppManifest("utilities").needs).toEqual(["agent"]);
    expect(getAppManifest("events").needs).toEqual(["location", "address"]);
    expect(getAppManifest("clock").needs).toEqual([]);
  });

  it("reports need status from facts", () => {
    const done: AppNeedFacts = { hasLocation: true, peopleCount: 2, connectionCount: 1, tokenCount: 3 };
    const todo: AppNeedFacts = { hasLocation: false, peopleCount: 0, connectionCount: 0, tokenCount: 0 };
    for (const need of ["location", "people", "connections", "agent"] as const) {
      expect(appNeedStatus(need, done), need).toBe("done");
      expect(appNeedStatus(need, todo), need).toBe("todo");
      expect(appNeedStatus(need, null), need).toBe("todo");
    }
    expect(appNeedStatus("address", done)).toBe("in-app");
    expect(appNeedStatus("address", todo)).toBe("in-app");
    expect(appNeedStatus("address", null)).toBe("in-app");
  });
});

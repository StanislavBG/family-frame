import { describe, it, expect } from "vitest";
import type { AppId } from "@shared/apps";
import { getHomeLayout, getScreensaverModes } from "./display-layout";

const only = (...ids: AppId[]) => (id: AppId) => ids.includes(id);
const all = () => true;
const none = () => false;

describe("getHomeLayout", () => {
  it("shows everything when all apps are on", () => {
    expect(getHomeLayout(all)).toEqual({
      showClock: true,
      showWeather: true,
      showLeftColumn: true,
      showCalendar: true,
      showStocks: true,
      showUnread: true,
    });
  });

  it("shows nothing when all apps are off", () => {
    expect(getHomeLayout(none)).toEqual({
      showClock: false,
      showWeather: false,
      showLeftColumn: false,
      showCalendar: false,
      showStocks: false,
      showUnread: false,
    });
  });

  it("keeps the left column when only clock is on", () => {
    const l = getHomeLayout(only("clock"));
    expect(l.showClock).toBe(true);
    expect(l.showWeather).toBe(false);
    expect(l.showLeftColumn).toBe(true);
    expect(l.showCalendar).toBe(false);
    expect(l.showStocks).toBe(false);
  });

  it("hides stocks when stocks is off", () => {
    const l = getHomeLayout((id) => id !== "stocks");
    expect(l.showStocks).toBe(false);
    expect(l.showCalendar).toBe(true);
    expect(l.showUnread).toBe(true);
  });
});

describe("getScreensaverModes", () => {
  for (const m of ["photos", "clock", "weather"] as const) {
    it(`${m} mode returns [${m}] when its app is on`, () => {
      expect(getScreensaverModes(m, only(m))).toEqual([m]);
    });
    it(`${m} mode falls back to clock when its app is off`, () => {
      expect(getScreensaverModes(m, none)).toEqual(["clock"]);
    });
  }

  it("cycle returns enabled modes in photos, clock, weather order", () => {
    expect(getScreensaverModes("cycle", all)).toEqual(["photos", "clock", "weather"]);
    expect(getScreensaverModes("cycle", only("weather", "photos"))).toEqual(["photos", "weather"]);
  });

  it("cycle with none enabled falls back to clock", () => {
    expect(getScreensaverModes("cycle", none)).toEqual(["clock"]);
  });
});

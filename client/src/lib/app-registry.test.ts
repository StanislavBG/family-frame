import { describe, expect, it } from "vitest";
import { appIdForPath, settingsPatchInvalidations } from "./app-registry";

describe("settingsPatchInvalidations", () => {
  it("invalidates only settings for a plain patch", () => {
    expect(settingsPatchInvalidations({ temperatureUnit: "celsius" } as never)).toEqual([["/api/settings"]]);
  });
  it.each(["photoSource", "photoMediaScope", "photoMediaPersonIds"])("adds photos for %s", (key) => {
    expect(settingsPatchInvalidations({ [key]: undefined } as never)).toEqual([["/api/settings"], ["/api/photos"]]);
  });
});

describe("appIdForPath", () => {
  it("matches apps and nested pages", () => {
    expect(appIdForPath("/weather")).toBe("weather");
    expect(appIdForPath("/calendar/day/2026-10-19")).toBe("calendar");
    expect(appIdForPath("/calendar?x=1")).toBe("calendar");
  });
  it("returns null for fixed and unknown paths", () => {
    expect(appIdForPath("/")).toBeNull();
    expect(appIdForPath("/settings")).toBeNull();
    expect(appIdForPath("/nope")).toBeNull();
  });
});

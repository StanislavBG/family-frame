import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseLocalDate, toISODateString } from "@/lib/format";
import { formatDay } from "@/lib/weather-utils";

const originalTZ = process.env.TZ;

describe.each(["America/Los_Angeles", "Europe/Sofia"])("local dates in %s", (tz) => {
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("toISODateString returns the local date", () => {
    expect(toISODateString(new Date(2026, 0, 23))).toBe("2026-01-23");
    expect(toISODateString(new Date(2026, 0, 23, 23, 59))).toBe("2026-01-23");
  });

  it("parseLocalDate round-trips", () => {
    const d = parseLocalDate("2026-01-23");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 0, 23, 0]);
    expect(toISODateString(d)).toBe("2026-01-23");
  });

  it("formatDay shows the right weekday", () => {
    expect(formatDay("2026-10-09", "en-US")).toBe("Fri");
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOSE_TO_HOME_KM, isCloseToHome } from "../shared/events-proximity";

const home = { city: "Santa Clara", region: "CA", country: "US" };
const elsewhere = { city: "Oakland", region: "CA", country: "US" };
const base = { online: false, tripIdea: false, eventPlace: elsewhere, home };

test("constant is 5 miles in km", () => {
  assert.equal(CLOSE_TO_HOME_KM, 8.05);
});

test("8.0 km is close", () => {
  assert.equal(isCloseToHome({ ...base, distanceKm: 8.0 }), true);
});

test("8.1 km in another city is not close", () => {
  assert.equal(isCloseToHome({ ...base, distanceKm: 8.1 }), false);
});

test("same city with different spelling is close at 12 km", () => {
  assert.equal(
    isCloseToHome({
      ...base,
      distanceKm: 12,
      eventPlace: { city: "Santa Clara, CA", country: "US" },
      home: { city: "santa clara", country: "United States" },
    }),
    true,
  );
});

test("online is never close", () => {
  assert.equal(isCloseToHome({ ...base, online: true, distanceKm: 1 }), false);
});

test("trip idea is never close", () => {
  assert.equal(isCloseToHome({ ...base, tripIdea: true, distanceKm: 1 }), false);
});

test("no distance and another city is not close", () => {
  assert.equal(isCloseToHome(base), false);
});

test("home null and no distance is not close", () => {
  assert.equal(isCloseToHome({ ...base, home: null }), false);
});

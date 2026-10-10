import { test } from "node:test";
import assert from "node:assert/strict";
import {
  householdAddressSchema,
  isAddressComplete,
  putEventsSharingSchema,
  householdProfileSchema,
  EVENTS_SHARING_CONSENT_VERSION,
} from "../shared/household";

const minimal = { line1: "1 Main St", city: "Sofia", country: "Bulgaria" };

test("full valid address parses", () => {
  const full = {
    ...minimal,
    line2: "Apt 4",
    region: "Sofia-grad",
    postalCode: "1000",
    timezone: "Europe/Sofia",
  };
  assert.deepEqual(householdAddressSchema.parse(full), full);
});

test("minimal valid address parses", () => {
  assert.equal(householdAddressSchema.safeParse(minimal).success, true);
});

test("unknown key rejected", () => {
  assert.equal(householdAddressSchema.safeParse({ ...minimal, extra: 1 }).success, false);
});

test("201-char line1 rejected", () => {
  assert.equal(
    householdAddressSchema.safeParse({ ...minimal, line1: "a".repeat(201) }).success,
    false,
  );
});

test("invalid timezone rejected", () => {
  assert.equal(
    householdAddressSchema.safeParse({ ...minimal, timezone: "Europe/../x" }).success,
    false,
  );
});

test("isAddressComplete", () => {
  assert.equal(isAddressComplete(minimal), true);
  assert.equal(isAddressComplete({ ...minimal, line1: "   " }), false);
  assert.equal(isAddressComplete(undefined), false);
  assert.equal(isAddressComplete(null), false);
});

test("putEventsSharingSchema rejects an extra key", () => {
  assert.equal(putEventsSharingSchema.safeParse({ enabled: true }).success, true);
  assert.equal(putEventsSharingSchema.safeParse({ enabled: true, x: 1 }).success, false);
});

test("householdProfile defaults eventsSharing to disabled", () => {
  assert.deepEqual(householdProfileSchema.parse({}).eventsSharing, { enabled: false });
  assert.equal(EVENTS_SHARING_CONSENT_VERSION, 1);
});

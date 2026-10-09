import { test } from "node:test";
import assert from "node:assert/strict";
import { getAppBaseUrl } from "./config";

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env.APP_BASE_URL;
  if (value === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = prev;
  }
}

test("defaults to the Replit URL when unset", () => {
  withEnv(undefined, () => assert.equal(getAppBaseUrl(), "https://family-frame.replit.app"));
});

test("returns APP_BASE_URL when set", () => {
  withEnv("http://localhost:5000", () => assert.equal(getAppBaseUrl(), "http://localhost:5000"));
});

test("trims trailing slashes", () => {
  withEnv("https://example.com//", () => assert.equal(getAppBaseUrl(), "https://example.com"));
});

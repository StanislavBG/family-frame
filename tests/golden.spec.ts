import { expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { buildBilkoBundle } from "../script/bilko-bundle";

const TARGET = "https://family-frame.replit.app/";
let bundleDir: string;
let indexHtml: string;

test.beforeAll(() => {
  delete process.env.APP_BASE_URL;
  bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "bilko-golden-"));
  buildBilkoBundle(bundleDir);
  indexHtml = fs.readFileSync(path.join(bundleDir, "index.html"), "utf8");
});

test.afterAll(() => {
  fs.rmSync(bundleDir, { recursive: true, force: true });
});

test("bundle page redirects to the hosted app", async ({ page }) => {
  await page.route("https://family-frame.replit.app/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stub</title>" }),
  );
  await page.goto(pathToFileURL(path.join(bundleDir, "index.html")).href);
  await page.waitForURL(TARGET);
  expect(page.url()).toBe(TARGET);
});

test("fallback shows heading and link to the hosted app", async ({ page }) => {
  const withoutRefresh = indexHtml.replace(/<meta http-equiv="refresh"[^>]*>/, "");
  expect(withoutRefresh).not.toContain("http-equiv");
  await page.setContent(withoutRefresh);
  await expect(page.getByRole("heading", { level: 1, name: "Family Frame" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Family Frame" })).toHaveAttribute("href", TARGET);
});

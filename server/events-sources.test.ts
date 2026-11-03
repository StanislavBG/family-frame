import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NON_ORIGINAL_DOMAINS, REGISTRATION_PLATFORMS, MULTI_TENANT_SUFFIXES, registrableDomain,
  isListingUrl, isRegistrationPlatformUrl, classifySource, sourceKindFor, officialSourceUrl,
  hasOfficialSource,
} from "../shared/events-sources";

test("exports lists", () => {
  assert.ok(NON_ORIGINAL_DOMAINS.includes("activekids.com"));
  assert.ok(REGISTRATION_PLATFORMS.length > 0);
  assert.ok(MULTI_TENANT_SUFFIXES.includes("squarespace.com"));
});

test("directories are listing even with matching organizer", () => {
  for (const d of [
    "activekids.com", "active.com", "lessons.com", "superprof.com", "superprof.co.uk",
    "lantern.llc", "coursetakers.com", "classpass.com", "groupon.com", "parentmap.com",
    "the-eastside.macaronikid.com", "seattleschild.com",
  ]) {
    const url = `https://www.${d}/x`;
    assert.equal(classifySource(url, `https://www.${d}/`), "listing", d);
    assert.equal(isListingUrl(url), true, d);
  }
  assert.equal(isListingUrl("https://foo.pages.dev/"), true);
  assert.equal(isListingUrl("https://example.org/"), false);
});

test("official when same registrable domain as organizer", () => {
  assert.equal(classifySource("https://picketfenceartstudio.com/classes", "https://www.picketfenceartstudio.com/"), "official");
  assert.equal(classifySource("https://www.goldfishswimschool.com/redmond", "https://goldfishswimschool.com/"), "official");
  assert.equal(classifySource("https://www.redmond.gov/123/Classes", "https://redmond.gov/"), "official");
});

test("listing by default deny", () => {
  const u = "https://www.picketfenceartstudio.com/classes";
  assert.equal(classifySource(u, "https://other.com/"), "listing");
  assert.equal(classifySource(u), "listing");
  assert.equal(classifySource(u, "not a url"), "listing");
  assert.equal(classifySource(u, "https://www.activekids.com/"), "listing");
  assert.equal(classifySource(u, "https://app.amilia.com/store/en/x/shop"), "listing");
  assert.equal(classifySource("http://picketfenceartstudio.com/", "https://picketfenceartstudio.com/"), "listing");
  assert.equal(classifySource("garbage", "https://picketfenceartstudio.com/"), "listing");
});

test("registration platforms", () => {
  assert.equal(classifySource("https://app.amilia.com/store/en/city-of-redmond/shop/programs"), "registration");
  assert.equal(classifySource("https://picket-fence-art-studio.coursestorm.com/course/x"), "registration");
  assert.equal(classifySource("https://app.amilia.com/"), "listing");
  assert.equal(classifySource("https://www.coursestorm.com/"), "listing");
  assert.equal(classifySource("https://www.eventbrite.com/"), "listing");
  assert.equal(classifySource("https://www.eventbrite.com/e/123"), "registration");
  assert.equal(classifySource("https://www.eventbrite.co.uk/e/123"), "registration");
  assert.equal(isRegistrationPlatformUrl("https://app.amilia.com/"), true);
  assert.equal(isRegistrationPlatformUrl("https://example.com/"), false);
});

test("registrableDomain", () => {
  assert.equal(registrableDomain("WWW.Example.com."), "example.com");
  assert.equal(registrableDomain("a.b.example.com"), "example.com");
  assert.equal(registrableDomain("www.example.co.uk"), "example.co.uk");
  assert.equal(registrableDomain("www.ci.santa-clara.ca.us"), "santa-clara.ca.us");
  assert.equal(registrableDomain("www.school.k12.ca.us"), "school.k12.ca.us");
  assert.equal(registrableDomain("a.squarespace.com"), "a.squarespace.com");
  assert.notEqual(registrableDomain("a.squarespace.com"), registrableDomain("b.squarespace.com"));
  assert.equal(registrableDomain("1.2.3.4"), null);
  assert.equal(registrableDomain("[::1]"), null);
  assert.equal(registrableDomain(""), null);
  assert.equal(registrableDomain("localhost"), null);
});

test("sourceKindFor and official source helpers", () => {
  assert.equal(sourceKindFor("official"), "official");
  assert.equal(sourceKindFor("registration"), "other");
  assert.equal(sourceKindFor("listing"), "listing");
  const src = (url: string, kind: any) => ({ url, kind, retrievedAt: "2026-11-02T00:00:00Z" });
  const ev: any = { sources: [src("https://a.com/", "listing"), src("https://b.com/", "official"), src("https://c.com/", "official")] };
  assert.equal(officialSourceUrl(ev), "https://b.com/");
  assert.equal(hasOfficialSource(ev), true);
  const none: any = { sources: [src("https://a.com/", "listing")] };
  assert.equal(officialSourceUrl(none), undefined);
  assert.equal(hasOfficialSource(none), false);
  assert.equal(hasOfficialSource({ sources: [] } as any), false);
});

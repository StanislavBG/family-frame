import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_TAG, ageOn, agesInYears, audienceGroup, isClassOrLesson, isClassTitle, isOngoingClass,
  isSignUpActivity, needsSignUp, signUpUrl, suitsAge, suitsPeople,
} from "../shared/events-activity";

const cost = (o: any = {}) => ({ isFree: true, ticketRequired: false, registrationRequired: false, ...o });
const sched = (o: any = {}) => ({ timezone: "UTC", start: "2026-11-02", allDay: true, occurrences: [], ...o });

test("CLASS_TAG and isClassTitle", () => {
  assert.equal(CLASS_TAG, "class");
  assert.equal(isClassTitle("Pottery Classes"), true);
  assert.equal(isClassTitle("Bootcamp Sale"), false);
  assert.equal(isClassTitle("Classic Car Show"), false);
});

test("isClassOrLesson by tag, title, tag words", () => {
  assert.equal(isClassOrLesson({ title: "x", tags: ["CLASS"] }), true);
  assert.equal(isClassOrLesson({ title: "Swim Lesson", tags: [] }), true);
  assert.equal(isClassOrLesson({ title: "x", tags: ["workshops"] }), true);
  assert.equal(isClassOrLesson({ title: "Bootcamp Sale", tags: [] }), false);
  assert.equal(isClassOrLesson({ title: "Classic Car Show", tags: ["cars"] }), false);
});

test("needsSignUp, isSignUpActivity", () => {
  assert.equal(needsSignUp({ cost: cost() } as any), false);
  assert.equal(needsSignUp({ cost: cost({ registrationRequired: true }) } as any), true);
  assert.equal(needsSignUp({ cost: cost({ registrationUrl: "https://r.example" }) } as any), true);
  assert.equal(isSignUpActivity({ title: "Art class", tags: [], cost: cost() } as any), true);
  assert.equal(isSignUpActivity({ title: "Fair", tags: [], cost: cost() } as any), false);
  assert.equal(isSignUpActivity({ title: "Fair", tags: [], cost: cost({ registrationRequired: true }) } as any), true);
});

test("signUpUrl precedence", () => {
  const org = { name: "o", url: "https://org.example" };
  const official = { url: "https://org.example/event", kind: "official" };
  const listing = { url: "https://src.example", kind: "listing" };
  const reg = (registrationUrl: string, o: any = {}) => cost({ registrationUrl, ...o });
  // activekids registrationUrl, no official source, no organizer
  assert.equal(signUpUrl({ sources: [listing], cost: reg("https://www.activekids.com/x") } as any), undefined);
  // activekids registrationUrl plus an official source
  assert.equal(
    signUpUrl({ sources: [listing, official], cost: reg("https://www.activekids.com/x") } as any),
    "https://org.example/event",
  );
  // registration-platform tenant
  assert.equal(
    signUpUrl({ sources: [listing], cost: reg("https://app.amilia.com/store/en/tenant") } as any),
    "https://app.amilia.com/store/en/tenant",
  );
  // registrationUrl on the organizer's domain is official
  assert.equal(
    signUpUrl({ organizer: org, sources: [], cost: reg("https://org.example/signup") } as any),
    "https://org.example/signup",
  );
  // listing organizer url is not returned
  assert.equal(
    signUpUrl({ organizer: { name: "o", url: "https://www.parentmap.com/x" }, sources: [listing], cost: cost({ registrationRequired: true }) } as any),
    undefined,
  );
  // organizer url fallback when sign-up needed and no official source
  assert.equal(signUpUrl({ organizer: org, sources: [listing], cost: cost({ registrationRequired: true }) } as any), "https://org.example");
  // listing-only event with registrationRequired
  assert.equal(signUpUrl({ sources: [listing], cost: cost({ registrationRequired: true }) } as any), undefined);
  assert.equal(signUpUrl({ organizer: org, sources: [official], cost: cost() } as any), undefined);
});

test("isOngoingClass", () => {
  const dated = { title: "Yoga class", tags: [], schedule: sched({ allDay: false, start: "2026-11-02T10:00:00Z" }) } as any;
  assert.equal(isOngoingClass(dated), false);
  assert.equal(isOngoingClass({ ...dated, schedule: sched() }), true);
  assert.equal(isOngoingClass({ title: "Fair", tags: [], schedule: sched() } as any), false);
});

test("audienceGroup", () => {
  const ev = (title: string, audience: any) => ({ title, audience }) as any;
  assert.equal(audienceGroup(ev("Fair", { ageBands: ["all-ages"] })), "everyone");
  assert.equal(audienceGroup(ev("Adults night", { ageBands: ["all-ages"] })), "adults");
  assert.equal(audienceGroup(ev("x", { ageBands: ["teen"], ageMin: 16 })), "adults");
  assert.equal(audienceGroup(ev("x", { ageBands: ["toddler", "adult"] })), "everyone");
  assert.equal(audienceGroup(ev("x", { ageBands: ["senior"] })), "adults");
  assert.equal(audienceGroup(ev("x", { ageBands: ["preschool"] })), "kids");
});

test("suitsAge", () => {
  assert.equal(suitsAge({ ageBands: ["all-ages"] }, 40), true);
  assert.equal(suitsAge({ ageBands: ["toddler"] }, 2), true);
  assert.equal(suitsAge({ ageBands: ["toddler"] }, 3), false);
  assert.equal(suitsAge({ ageBands: ["senior"] }, 50), false);
  assert.equal(suitsAge({ ageBands: ["all-ages"], ageMin: 8 }, 7), false);
  assert.equal(suitsAge({ ageBands: ["all-ages"], ageMax: 10 }, 11), false);
  assert.equal(suitsAge({ ageBands: ["adult"], ageMin: 5, ageMax: 10 }, 7), true);
});

test("suitsPeople", () => {
  const kids = { ageBands: ["school-age" as const] };
  assert.equal(suitsPeople(kids, []), true);
  assert.equal(suitsPeople(kids, [8, 40]), true); // adult picked with a child
  assert.equal(suitsPeople(kids, [8, 3]), false);
  assert.equal(suitsPeople(kids, [40]), false);
  assert.equal(suitsPeople({ ageBands: ["adult"] }, [40, 35]), true);
});

test("ageOn", () => {
  assert.equal(ageOn("2020-06-15", "2026-06-14"), 5);
  assert.equal(ageOn("2020-06-15", "2026-06-15"), 6);
  assert.equal(ageOn(undefined, "2026-06-15"), null);
  assert.equal(ageOn("bad", "2026-06-15"), null);
  assert.equal(ageOn("2030-01-01", "2026-06-15"), null);
});

test("agesInYears converts months for children-only bands", () => {
  const f = (ageBands: any[], ageMin?: number, ageMax?: number) => agesInYears({ ageBands, ageMin, ageMax });
  assert.deepEqual(f(["toddler"], 24, 36), { ageMin: 2, ageMax: 3 });
  assert.deepEqual(f(["toddler"], 16, 35), { ageMin: 1, ageMax: 3 });
  assert.deepEqual(f(["toddler"], 4, 24), { ageMin: 0, ageMax: 2 });
  assert.deepEqual(f(["baby", "toddler"], 0, 36), { ageMin: 0, ageMax: 3 });
  assert.deepEqual(f(["toddler"], 18, 30), { ageMin: 1, ageMax: 3 });
  assert.deepEqual(f(["school-age"], 6, 12), { ageMin: 6, ageMax: 12 });
  assert.deepEqual(f(["teen"], 13, 17), { ageMin: 13, ageMax: 17 });
  assert.deepEqual(f(["adult"], 18), { ageMin: 18 });
  assert.deepEqual(f([], 24, 36), { ageMin: 24, ageMax: 36 });
});

test("months-valued toddler class is kids and suits ages 2 and 3, not 40", () => {
  const a = { ageBands: ["toddler"] as any, ageMin: 24, ageMax: 36 };
  assert.equal(audienceGroup({ title: "Music class", audience: a } as any), "kids");
  assert.equal(audienceGroup({ title: "x", audience: { ageBands: ["toddler"] as any, ageMin: 18 } } as any), "kids");
  assert.equal(suitsAge(a, 2), true);
  assert.equal(suitsAge(a, 3), true);
  assert.equal(suitsAge(a, 40), false);
  assert.equal(audienceGroup({ title: "x", audience: { ageBands: ["adult"] as any, ageMin: 18 } } as any), "adults");
});

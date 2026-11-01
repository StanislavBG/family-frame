import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_TAG, ageOn, audienceGroup, isClassOrLesson, isClassTitle, isOngoingClass,
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
  const base = { organizer: { name: "o", url: "https://org.example" }, sources: [{ url: "https://src.example" }] };
  assert.equal(signUpUrl({ ...base, cost: cost({ registrationUrl: "https://r.example" }) } as any), "https://r.example");
  assert.equal(signUpUrl({ ...base, cost: cost({ registrationRequired: true }) } as any), "https://org.example");
  assert.equal(signUpUrl({ sources: base.sources, cost: cost({ registrationRequired: true }) } as any), "https://src.example");
  assert.equal(signUpUrl({ ...base, cost: cost() } as any), undefined);
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

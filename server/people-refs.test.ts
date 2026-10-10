import { test } from "node:test";
import assert from "node:assert/strict";
import { removePersonRefs } from "./people-refs";

const person = (id: string) => ({ id, name: id }) as any;
const event = (id: string, people: string[]) => ({ id, people }) as any;

test("removes the person from people, events and photoMediaPersonIds", () => {
  const input = {
    people: [person("a"), person("b")],
    events: [event("e1", ["a", "b"]), event("e2", ["b"])],
    settings: { photoMediaScope: "people", photoMediaPersonIds: ["a", "b"] } as any,
  };
  const out = removePersonRefs(input, "a");
  assert.deepEqual(out.people.map((p: any) => p.id), ["b"]);
  assert.deepEqual(out.events.map((e: any) => e.people), [["b"], ["b"]]);
  assert.deepEqual(out.settings.photoMediaPersonIds, ["b"]);
  assert.equal(out.settings.photoMediaScope, "people");
});

test("does not mutate inputs", () => {
  const input = {
    people: [person("a")],
    events: [event("e1", ["a"])],
    settings: { photoMediaPersonIds: ["a"] } as any,
  };
  const snapshot = JSON.parse(JSON.stringify(input));
  removePersonRefs(input, "a");
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});

test("person not present is a no-op", () => {
  const input = {
    people: [person("a")],
    events: [event("e1", ["a"])],
    settings: { photoMediaScope: "people", photoMediaPersonIds: ["a"] } as any,
  };
  const out = removePersonRefs(input, "zzz");
  assert.deepEqual(out.people, input.people);
  assert.deepEqual(out.events, input.events);
  assert.deepEqual(out.settings, input.settings);
});

test("handles undefined settings, photoMediaPersonIds and arrays", () => {
  const a = removePersonRefs({ people: undefined, events: undefined, settings: undefined } as any, "a");
  assert.deepEqual(a.people, []);
  assert.deepEqual(a.events, []);
  assert.equal(a.settings?.photoMediaPersonIds, undefined);
  const b = removePersonRefs({ people: [], events: [], settings: { theme: "x" } as any }, "a");
  assert.equal("photoMediaPersonIds" in b.settings, false);
});

test("keeps scope people when the list empties", () => {
  const out = removePersonRefs(
    { people: [person("a")], events: [], settings: { photoMediaScope: "people", photoMediaPersonIds: ["a"] } as any },
    "a",
  );
  assert.deepEqual(out.settings.photoMediaPersonIds, []);
  assert.equal(out.settings.photoMediaScope, "people");
});

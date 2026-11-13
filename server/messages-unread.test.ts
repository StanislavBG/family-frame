import { test } from "node:test";
import assert from "node:assert/strict";
import { countUnreadMessages } from "./apps/messages";

function fakeDb(tree: Record<string, unknown>) {
  const paths: string[] = [];
  const db = {
    ref(path: string) {
      paths.push(path);
      return {
        async once(_event: "value") {
          const v = path in tree ? tree[path] : null;
          return { val: () => v, exists: () => v !== null && v !== undefined };
        },
      };
    },
  };
  return { db, paths };
}

const noFallback = async (): Promise<any> => {
  throw new Error("fallback must not be called for an existing user");
};

test("existing user: reads only messages and one existence child, never the root", async () => {
  const { db, paths } = fakeDb({
    "users/u1/clerkId": "u1",
    "users/u1/messages": [{ id: "a", isRead: false }, { id: "b", isRead: true }, { id: "c" }],
  });
  const count = await countUnreadMessages(db, "u1", "alice", noFallback);
  assert.equal(count, 2);
  assert.ok(!paths.includes("users/u1"), "root must not be read");
  assert.deepEqual([...paths].sort(), ["users/u1/clerkId", "users/u1/messages"]);
});

test("existing user: Firebase object shape is normalized", async () => {
  const { db } = fakeDb({
    "users/u1/clerkId": "u1",
    "users/u1/messages": { k1: { id: "a", isRead: true }, k2: { id: "b", isRead: false }, k3: { id: "c", isRead: false } },
  });
  assert.equal(await countUnreadMessages(db, "u1", "alice", noFallback), 2);
});

test("existing user with no messages counts 0", async () => {
  const { db } = fakeDb({ "users/u1/clerkId": "u1" });
  assert.equal(await countUnreadMessages(db, "u1", "alice", noFallback), 0);
});

test("missing user: calls fallback and counts from its result", async () => {
  const { db, paths } = fakeDb({});
  const calls: Array<[string, string]> = [];
  const fallback = async (id: string, name: string): Promise<any> => {
    calls.push([id, name]);
    return { clerkId: id, username: name, messages: { x: { id: "x", isRead: false } } };
  };
  assert.equal(await countUnreadMessages(db, "u2", "bob", fallback), 1);
  assert.deepEqual(calls, [["u2", "bob"]]);
  assert.ok(!paths.includes("users/u2"));
});

test("missing user: fresh default record counts 0", async () => {
  const { db } = fakeDb({});
  const fallback = async (): Promise<any> => ({ messages: [] });
  assert.equal(await countUnreadMessages(db, "u3", "c", fallback), 0);
});

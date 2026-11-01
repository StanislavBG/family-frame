import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readStored, writeStored, resetSessionStateStore, useSessionState, getSessionValue, setSessionValue, type StorageLike } from "./use-session-state";

(globalThis as { React?: typeof React }).React = React;

const parseStr = (raw: unknown): string => {
  if (typeof raw !== "string") throw new Error("bad");
  return raw;
};

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

beforeEach(() => resetSessionStateStore());

describe("storage helpers", () => {
  it("round trips through a fake storage", () => {
    const s = fakeStorage();
    writeStored("k", "agenda", s);
    expect(readStored("k", "month", parseStr, s)).toBe("agenda");
  });

  it("falls back on corrupt JSON", () => {
    const s = fakeStorage();
    s.data.set("ff:session-state:k", "{not json");
    expect(readStored("k", "init", parseStr, s)).toBe("init");
  });

  it("falls back when parse rejects the stored value", () => {
    const s = fakeStorage();
    s.data.set("ff:session-state:k", "42");
    expect(readStored("k", "init", parseStr, s)).toBe("init");
  });

  it("falls back when storage is missing or throws", () => {
    expect(readStored("k", "init", parseStr, undefined)).toBe("init");
    const boom: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readStored("k", "init", parseStr, boom)).toBe("init");
    expect(() => writeStored("k", "v", boom)).not.toThrow();
    expect(() => writeStored("k", "v", undefined)).not.toThrow();
  });
});

describe("module store", () => {
  it("shares one key across callers and keeps the value after unmount", () => {
    setSessionValue("shared", "month", "agenda", parseStr);
    expect(getSessionValue("shared", "agenda", parseStr)).toBe("month");
    function C() {
      const [v] = useSessionState("shared", "agenda", parseStr);
      return React.createElement("span", null, v);
    }
    // server render uses the initial snapshot; store value persists independently
    expect(renderToStaticMarkup(React.createElement(C))).toBe("<span>agenda</span>");
    expect(getSessionValue("shared", "agenda", parseStr)).toBe("month");
  });
});

describe("useSessionState", () => {
  it("renders the initial value on the server without throwing", () => {
    function C() {
      const [v] = useSessionState("ssr", "hello", parseStr);
      return React.createElement("span", null, v);
    }
    expect(renderToStaticMarkup(React.createElement(C))).toBe("<span>hello</span>");
  });

  it("works with no window/sessionStorage in node", () => {
    function C() {
      const [v] = useSessionState("node", "x", parseStr);
      return React.createElement("span", null, v);
    }
    expect(() => renderToStaticMarkup(React.createElement(C))).not.toThrow();
  });
});

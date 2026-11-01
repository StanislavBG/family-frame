import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import { WhoPicker } from "./event-actions";

(globalThis as { React?: typeof React }).React = React;

function render(people: { id: string; name: string }[], value: string[]): string {
  const client = new QueryClient();
  client.setQueryData(queryKeys.people(), people);
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, React.createElement(WhoPicker, { value, onChange: () => {} })),
  );
}

describe("WhoPicker", () => {
  it("lists people as toggles, pressed from value", () => {
    const html = render([{ id: "p1", name: "Ana" }, { id: "p2", name: "Boris" }], ["p2"]);
    expect(html).toContain('data-testid="button-plan-person-p1"');
    expect(html).toContain('data-testid="button-plan-person-p2"');
    expect(html).toContain("Boris is going");
    expect(html).toContain("Ana is not going");
  });
  it("is hidden with no people", () => {
    expect(render([], [])).toBe("");
  });
});

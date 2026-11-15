import { describe, expect, it } from "vitest";
import { DOCS_BASE_URL, docsUrl } from "./docs-links";

describe("docsUrl", () => {
  it("exposes the public GitHub docs base", () => {
    expect(DOCS_BASE_URL).toBe("https://github.com/StanislavBG/family-frame/blob/main/docs/");
  });
  it("links the person publishing guide", () => {
    expect(docsUrl("person-publishing.md")).toBe(
      "https://github.com/StanislavBG/family-frame/blob/main/docs/person-publishing.md",
    );
  });
  it("links the time-series guide", () => {
    expect(docsUrl("time-series.md")).toBe("https://github.com/StanislavBG/family-frame/blob/main/docs/time-series.md");
  });
});

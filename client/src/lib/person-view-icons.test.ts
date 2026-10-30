import { describe, expect, it } from "vitest";
import { Mail, Sparkles } from "lucide-react";
import { PERSON_VIEW_ICONS } from "@shared/person-views";
import { VIEW_ICONS, viewIcon } from "./person-view-icons";

describe("person view icons", () => {
  it("has a glyph for exactly the schema icons", () => {
    expect(Object.keys(VIEW_ICONS).sort()).toEqual([...PERSON_VIEW_ICONS].sort());
  });
  it("maps mail to Mail", () => {
    expect(viewIcon("mail")).toBe(Mail);
  });
  it("falls back to Sparkles", () => {
    expect(viewIcon(undefined)).toBe(Sparkles);
    expect(viewIcon("nope")).toBe(Sparkles);
    expect(viewIcon("constructor")).toBe(Sparkles);
  });
});

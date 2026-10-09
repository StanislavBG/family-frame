import { describe, expect, it } from "vitest";
import { getPhotoSrc, getProxiedPhotoUrl } from "@/lib/photo-src";

describe("getPhotoSrc", () => {
  it("returns baseUrl unchanged for a cached photo", () => {
    expect(getPhotoSrc({ baseUrl: "/api/photos/cache/abc.jpg", cached: true })).toBe(
      "/api/photos/cache/abc.jpg",
    );
  });

  it("returns the proxy URL with the size suffix encoded for an uncached photo", () => {
    const baseUrl = "https://lh3.googleusercontent.com/abc";
    const src = getPhotoSrc({ baseUrl, cached: false });
    expect(src).toBe(`/api/photos/proxy?url=${encodeURIComponent(`${baseUrl}=w1920-h1080`)}`);
    expect(src).toContain("%3Dw1920-h1080");
    expect(src).toBe(getProxiedPhotoUrl(baseUrl));
  });

  it("returns (does not overflow the stack) for an uncached photo", () => {
    expect(() => getPhotoSrc({ baseUrl: "https://example.com/x" })).not.toThrow(RangeError);
  });
});

import { describe, it, expect } from "bun:test";
import { buildPlexDeepLink } from "./deep-link";

describe("buildPlexDeepLink", () => {
  it("builds a valid deep link with correct server ID and rating key", () => {
    const url = buildPlexDeepLink("abc123", "456");
    expect(url).toBe(
      "https://app.plex.tv/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F456"
    );
  });

  it("URL-encodes the rating key path", () => {
    const url = buildPlexDeepLink("server-id", "12345");
    expect(url).toContain("%2Flibrary%2Fmetadata%2F12345");
  });

  it("does not include /desktop in the path", () => {
    const url = buildPlexDeepLink("server-id", "1");
    expect(url).not.toContain("/desktop");
  });
});

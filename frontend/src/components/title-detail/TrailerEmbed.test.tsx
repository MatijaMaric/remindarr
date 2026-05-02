import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TrailerEmbed, { hasTrailer } from "./TrailerEmbed";
import type { TmdbVideo } from "../../types";

// happy-dom does not implement window.matchMedia; provide a stub that survives
// cross-file test runs (Object.defineProperty can only be called once per
// property; subsequent calls on the same property throw a TypeError).
const matchMediaStub = mock(() => ({ matches: false }));

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMediaStub,
  });
} else if (typeof window !== "undefined") {
  window.matchMedia = matchMediaStub as typeof window.matchMedia;
}

beforeEach(() => {
  window.matchMedia = matchMediaStub as typeof window.matchMedia;
});

afterEach(cleanup);

function makeVideo(overrides: Partial<TmdbVideo> = {}): TmdbVideo {
  return {
    key: "abc123",
    site: "YouTube",
    type: "Trailer",
    official: true,
    size: 1080,
    published_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TrailerEmbed", () => {
  it("renders the thumbnail facade when videos contain a YouTube Trailer", () => {
    const videos = [makeVideo()];
    render(<TrailerEmbed videos={videos} />);

    const img = screen.getByRole("img", { name: /thumbnail/i });
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toContain("img.youtube.com/vi/abc123/hqdefault.jpg");
  });

  it("swaps to an iframe after clicking the thumbnail facade", () => {
    const videos = [makeVideo()];
    render(<TrailerEmbed videos={videos} />);

    // Before click: no iframe
    expect(screen.queryByTitle("Trailer")).toBeNull();

    // Click the facade container
    const container = screen.getByRole("img", { name: /thumbnail/i }).closest("div") as HTMLElement;
    fireEvent.click(container);

    const iframe = screen.getByTitle("Trailer") as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.src).toContain("youtube-nocookie.com/embed/abc123");
  });

  it("returns null when videos contain only non-Trailer types", () => {
    const videos = [makeVideo({ type: "Featurette" }), makeVideo({ type: "Teaser" })];
    const { container } = render(<TrailerEmbed videos={videos} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when videos array is empty", () => {
    const { container } = render(<TrailerEmbed videos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("prefers official trailers over unofficial", () => {
    const videos = [
      makeVideo({ key: "unofficial", official: false, size: 1080 }),
      makeVideo({ key: "official", official: true, size: 720 }),
    ];
    render(<TrailerEmbed videos={videos} />);

    const img = screen.getByRole("img", { name: /thumbnail/i }) as HTMLImageElement;
    expect(img.src).toContain("vi/official/");
  });

  it("among equal official status, prefers highest size", () => {
    const videos = [
      makeVideo({ key: "hd", official: true, size: 1080 }),
      makeVideo({ key: "sd", official: true, size: 480 }),
    ];
    render(<TrailerEmbed videos={videos} />);

    const img = screen.getByRole("img", { name: /thumbnail/i }) as HTMLImageElement;
    expect(img.src).toContain("vi/hd/");
  });

  it("filters out non-YouTube videos even if type is Trailer", () => {
    const videos = [makeVideo({ site: "Vimeo", key: "vimeo-key" })];
    const { container } = render(<TrailerEmbed videos={videos} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("hasTrailer", () => {
  it("returns false for empty array", () => {
    expect(hasTrailer([])).toBe(false);
  });

  it("returns false when no YouTube Trailer is present", () => {
    expect(hasTrailer([makeVideo({ type: "Featurette" })])).toBe(false);
    expect(hasTrailer([makeVideo({ site: "Vimeo" })])).toBe(false);
  });

  it("returns true when at least one YouTube Trailer is present", () => {
    expect(hasTrailer([makeVideo()])).toBe(true);
    expect(hasTrailer([makeVideo({ type: "Teaser" }), makeVideo()])).toBe(true);
  });
});

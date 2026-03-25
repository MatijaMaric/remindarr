import { describe, it, expect, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useDominantColor, useDominantColors } from "./useDominantColor";

// Mock fast-average-color — Image loading doesn't work in happy-dom
mock.module("fast-average-color", () => ({
  FastAverageColor: class {
    getColor() {
      return { hex: "#1a2b3c", isDark: true };
    }
  },
}));

describe("useDominantColor", () => {
  it("returns default color for null URL", () => {
    const { result } = renderHook(() => useDominantColor(null));
    expect(result.current.color).toBe("rgb(24, 24, 27)");
    expect(result.current.isDark).toBe(true);
  });

  it("returns default color initially for a URL (before image loads)", () => {
    const { result } = renderHook(() =>
      useDominantColor("https://example.com/img.jpg")
    );
    // Before the image loads, should still have the default
    expect(result.current.isDark).toBe(true);
  });
});

describe("useDominantColors", () => {
  it("returns default colors for empty array", () => {
    const { result } = renderHook(() => useDominantColors([]));
    expect(result.current).toEqual([]);
  });

  it("returns default colors for null URLs", () => {
    const { result } = renderHook(() => useDominantColors([null, null]));
    expect(result.current).toHaveLength(2);
    expect(result.current[0].color).toBe("rgb(24, 24, 27)");
    expect(result.current[1].color).toBe("rgb(24, 24, 27)");
  });

  it("returns correct number of results matching input length", () => {
    const urls = ["https://a.com/1.jpg", null, "https://b.com/2.jpg"];
    const { result } = renderHook(() => useDominantColors(urls));
    expect(result.current).toHaveLength(3);
  });
});

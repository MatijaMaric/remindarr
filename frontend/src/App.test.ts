import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { navLinkClass } from "./nav-utils";

describe("navLinkClass", () => {
  it("returns desktop active classes with underline indicator", () => {
    const result = navLinkClass(true);
    expect(result).toContain("border-amber-400");
    expect(result).toContain("text-zinc-100");
    expect(result).not.toContain("block w-full");
    expect(result).not.toContain("bg-amber-500");
  });

  it("returns desktop inactive classes", () => {
    const result = navLinkClass(false);
    expect(result).toContain("text-zinc-400");
    expect(result).toContain("border-transparent");
    expect(result).not.toContain("bg-amber-500");
  });

  it("returns mobile active classes", () => {
    const result = navLinkClass(true, true);
    expect(result).toContain("block w-full px-3 py-2.5");
    expect(result).toContain("bg-amber-500 text-zinc-950");
    expect(result).not.toContain("border-amber-400");
  });

  it("returns mobile inactive classes", () => {
    const result = navLinkClass(false, true);
    expect(result).toContain("block w-full px-3 py-2.5");
    expect(result).toContain("text-zinc-400 hover:text-white hover:bg-zinc-800");
    expect(result).not.toContain("bg-amber-500");
  });

  it("desktop always includes common classes", () => {
    for (const isActive of [true, false]) {
      const result = navLinkClass(isActive);
      expect(result).toContain("text-sm");
      expect(result).toContain("transition-colors");
      expect(result).toContain("border-b-2");
    }
  });
});

describe("nav search button a11y (WCAG 2.5.3)", () => {
  const src = readFileSync(join(import.meta.dir, "App.tsx"), "utf-8");

  it("search trigger button has no aria-label (accessible name derives from visible text)", () => {
    // Extract the <button> JSX block for the ⌘K search trigger so we only
    // inspect the right button and not unrelated aria-labels in the file.
    // Slice from the <button after the comment marker.
    const commentMarker = "{/* ⌘K search trigger */}";
    const commentPos = src.indexOf(commentMarker);
    const buttonStart = src.indexOf("<button", commentPos);
    const buttonEnd = src.indexOf("</button>", buttonStart) + "</button>".length;
    const buttonSrc = src.slice(buttonStart, buttonEnd);
    expect(buttonSrc).not.toContain("aria-label");
  });

  it("⌘K keyboard hint span is aria-hidden to exclude it from the accessible name", () => {
    const commentMarker = "{/* ⌘K search trigger */}";
    const commentPos = src.indexOf(commentMarker);
    const buttonStart = src.indexOf("<button", commentPos);
    const buttonEnd = src.indexOf("</button>", buttonStart) + "</button>".length;
    const buttonSrc = src.slice(buttonStart, buttonEnd);
    // The aria-hidden span must appear before the ⌘K glyph
    const ariaHiddenIdx = buttonSrc.indexOf('aria-hidden="true"');
    const cmdKIdx = buttonSrc.indexOf("⌘K");
    expect(ariaHiddenIdx).toBeGreaterThan(-1);
    expect(cmdKIdx).toBeGreaterThan(-1);
    expect(ariaHiddenIdx).toBeLessThan(cmdKIdx);
  });
});

import { describe, it, expect } from "bun:test";
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

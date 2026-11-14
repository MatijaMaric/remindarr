import { describe, it, expect } from "bun:test";
import { navLinkClass } from "./nav-utils";

describe("navLinkClass", () => {
  it("marks the desktop active link with the accent text colour only", () => {
    const result = navLinkClass(true);
    expect(result).toContain("text-primary-text");
    expect(result).toContain("font-semibold");
    expect(result).not.toContain("block w-full");
    expect(result).not.toContain("bg-primary");
    expect(result).not.toContain("border-");
  });

  it("returns desktop inactive classes", () => {
    const result = navLinkClass(false);
    expect(result).toContain("text-muted-foreground");
    expect(result).toContain("hover:bg-accent");
    expect(result).not.toContain("text-primary-text");
    expect(result).not.toContain("bg-primary");
  });

  it("returns mobile active classes", () => {
    const result = navLinkClass(true, true);
    expect(result).toContain("block w-full px-3 py-2.5");
    expect(result).toContain("bg-primary text-primary-foreground");
    expect(result).not.toContain("border-primary");
  });

  it("returns mobile inactive classes", () => {
    const result = navLinkClass(false, true);
    expect(result).toContain("block w-full px-3 py-2.5");
    expect(result).toContain(
      "text-muted-foreground hover:text-foreground hover:bg-muted",
    );
    expect(result).not.toContain("bg-primary");
  });

  it("desktop always includes common classes", () => {
    for (const isActive of [true, false]) {
      const result = navLinkClass(isActive);
      expect(result).toContain("text-sm");
      expect(result).toContain("transition-colors");
      expect(result).toContain("rounded-md");
    }
  });
});

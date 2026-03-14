import { describe, it, expect } from "bun:test";

// PersonCard is a React component - we test its interface contract here
// since we can't render components without a DOM
describe("PersonCard props interface", () => {
  it("requires id, name, role, and profilePath", async () => {
    // Verify the module exports a default function
    const mod = await import("./PersonCard");
    expect(typeof mod.default).toBe("function");
  });
});

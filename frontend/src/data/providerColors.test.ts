import { describe, it, expect } from "bun:test";
import { getProviderColor } from "./providerColors";

describe("getProviderColor", () => {
  it("returns Netflix colors for provider ID 8", () => {
    const color = getProviderColor(8);
    expect(color.bg).toBe("#E50914");
    expect(color.text).toBe("#ffffff");
  });

  it("returns Disney+ colors for provider ID 337", () => {
    const color = getProviderColor(337);
    expect(color.bg).toBe("#0063E5");
  });

  it("returns default zinc color for unknown provider ID", () => {
    const color = getProviderColor(99999);
    expect(color.bg).toBe("#3F3F46");
    expect(color.text).toBe("#ffffff");
  });

  it("returns different bg and hover colors", () => {
    const color = getProviderColor(8);
    expect(color.bg).not.toBe(color.hover);
  });
});

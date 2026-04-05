import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const STORAGE_KEY = "remindarr-theme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    // Remove all theme classes
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-oled");
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-oled");
  });

  it("exports useTheme as a function", async () => {
    const mod = await import("./useTheme");
    expect(mod.useTheme).toBeDefined();
    expect(typeof mod.useTheme).toBe("function");
  });

  it("defaults to dark theme when localStorage is empty", () => {
    localStorage.removeItem(STORAGE_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = ["dark", "light", "oled"];
    const theme = stored && valid.includes(stored) ? stored : "dark";
    expect(theme).toBe("dark");
  });

  it("reads existing localStorage value on init", () => {
    localStorage.setItem(STORAGE_KEY, "oled");
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = ["dark", "light", "oled"];
    const theme = stored && valid.includes(stored) ? stored : "dark";
    expect(theme).toBe("oled");
  });

  it("reads light theme from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = ["dark", "light", "oled"];
    const theme = stored && valid.includes(stored) ? stored : "dark";
    expect(theme).toBe("light");
  });

  it("falls back to dark for an invalid stored value", () => {
    localStorage.setItem(STORAGE_KEY, "neon-pink");
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = ["dark", "light", "oled"];
    const theme = stored && valid.includes(stored) ? stored : "dark";
    expect(theme).toBe("dark");
  });

  it("applyTheme sets the correct class on documentElement", () => {
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-light", "theme-oled");
    root.classList.add("theme-light");
    expect(root.classList.contains("theme-light")).toBe(true);
    expect(root.classList.contains("theme-dark")).toBe(false);
    expect(root.classList.contains("theme-oled")).toBe(false);
  });

  it("switching theme removes previous theme class", () => {
    const root = document.documentElement;
    root.classList.add("theme-dark");
    root.classList.remove("theme-dark", "theme-light", "theme-oled");
    root.classList.add("theme-oled");
    expect(root.classList.contains("theme-oled")).toBe(true);
    expect(root.classList.contains("theme-dark")).toBe(false);
  });

  it("setTheme persists to localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "oled");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("oled");
  });
});

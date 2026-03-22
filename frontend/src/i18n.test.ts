import { describe, it, expect } from "bun:test";
import i18n from "./i18n";
import en from "./locales/en.json";

describe("i18n", () => {
  it("initializes with English as default", () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it("translates basic keys", () => {
    const result = i18n.t("nav.home");
    expect(result).toBe("Home");
  });

  it("translates with interpolation", () => {
    const result = i18n.t("home.season", { number: 3 });
    expect(result).toBe("Season 3");
  });

  it("has all required top-level namespaces", () => {
    const requiredNamespaces = [
      "nav", "bottomNav", "home", "tracked", "upcoming",
      "browse", "login", "profile", "filter", "search",
      "releases", "track", "episodes", "calendar", "common"
    ];
    for (const ns of requiredNamespaces) {
      expect(en).toHaveProperty(ns);
    }
  });

  it("falls back gracefully for missing keys", () => {
    const result = i18n.t("nonexistent.key");
    expect(result).toBe("nonexistent.key");
  });

  it("translates login fields", () => {
    expect(i18n.t("login.username")).toBe("Username");
    expect(i18n.t("login.password")).toBe("Password");
    expect(i18n.t("login.signIn")).toBe("Sign In");
  });

  it("translates track button states", () => {
    expect(i18n.t("track.track")).toBe("Track");
    expect(i18n.t("track.tracked")).toBe("Tracked");
  });

  it("translates filter labels", () => {
    expect(i18n.t("filter.all")).toBe("All");
    expect(i18n.t("filter.movies")).toBe("Movies");
    expect(i18n.t("filter.shows")).toBe("Shows");
  });

  it("translates episodes labels", () => {
    expect(i18n.t("episodes.tomorrow")).toBe("Tomorrow");
    expect(i18n.t("episodes.markAsWatched")).toBe("Mark as watched");
    expect(i18n.t("episodes.markAsUnwatched")).toBe("Mark as unwatched");
  });

  it("handles interpolation in login failed message", () => {
    const result = i18n.t("login.loginFailed", { error: "invalid credentials" });
    expect(result).toBe("Login failed: invalid credentials");
  });
});

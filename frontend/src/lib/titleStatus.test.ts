import { describe, expect, it } from "bun:test";
import en from "../locales/en.json";
import { getEffectiveStatus, statusLabelKey } from "./titleStatus";

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );
}

describe("getEffectiveStatus", () => {
  it("prefers the user status over the show status", () => {
    expect(
      getEffectiveStatus({ user_status: "dropped", show_status: "watching" }),
    ).toBe("dropped");
  });
});

describe("statusLabelKey", () => {
  it.each([
    ["watching", "Watching"],
    ["completed", "Completed"],
    ["on_hold", "On Hold"],
    ["dropped", "Dropped"],
    ["plan_to_watch", "Plan to Watch"],
    ["caught_up", "Caught Up"],
    ["not_started", "Not Started"],
    ["unreleased", "Unreleased"],
  ])("maps %s to an existing English label", (status, label) => {
    const key = statusLabelKey(status);
    expect(key).not.toBeNull();
    expect(lookup(key!)).toBe(label);
  });

  it("returns null for missing or unknown statuses", () => {
    expect(statusLabelKey(null)).toBeNull();
    expect(statusLabelKey("mystery")).toBeNull();
  });
});

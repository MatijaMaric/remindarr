import { describe, it, expect } from "bun:test";
import { ACHIEVEMENTS } from "../../../../server/achievements/definitions";
import { ACHIEVEMENT_ICONS } from "./icons";

// Every icon name used on the server needs a component here, otherwise the
// badge silently falls back to a generic trophy.
describe("achievement icons", () => {
  it("every definition's icon is in ACHIEVEMENT_ICONS", () => {
    const missing = ACHIEVEMENTS.filter(
      (a) => !(a.icon in ACHIEVEMENT_ICONS),
    ).map((a) => `${a.key}:${a.icon}`);
    expect(missing).toEqual([]);
  });

  it("no definition uses the Trophy fallback as its own icon", () => {
    expect(
      ACHIEVEMENTS.filter((a) => a.icon === "Trophy").map((a) => a.key),
    ).toEqual([]);
  });
});

import { describe, it, expect } from "bun:test";
import { getISOWeekKey } from "./isoWeek";

describe("getISOWeekKey", () => {
  it("Jan 1 2024 (Monday) is 2024-W01", () => {
    expect(getISOWeekKey(new Date(2024, 0, 1))).toBe("2024-W01");
  });

  it("Dec 31 2023 (Sunday) is 2023-W52", () => {
    expect(getISOWeekKey(new Date(2023, 11, 31))).toBe("2023-W52");
  });

  it("Jan 1 2023 (Sunday) is 2022-W52 (belongs to prior ISO year)", () => {
    expect(getISOWeekKey(new Date(2023, 0, 1))).toBe("2022-W52");
  });

  it("Jan 4 2021 (Monday) is 2021-W01", () => {
    expect(getISOWeekKey(new Date(2021, 0, 4))).toBe("2021-W01");
  });

  it("Dec 28 2020 (Monday) is 2020-W53 (2020 has 53 ISO weeks)", () => {
    expect(getISOWeekKey(new Date(2020, 11, 28))).toBe("2020-W53");
  });

  it("Jan 3 2022 (Monday) is 2022-W01", () => {
    expect(getISOWeekKey(new Date(2022, 0, 3))).toBe("2022-W01");
  });

  it("consecutive days within the same week share the same key", () => {
    // 2024-W10: Mon Mar 4 – Sun Mar 10 2024
    const keys = [4, 5, 6, 7, 8, 9, 10].map((d) =>
      getISOWeekKey(new Date(2024, 2, d))
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("2024-W10");
  });

  it("Monday and Sunday of different weeks return different keys", () => {
    const monday = getISOWeekKey(new Date(2024, 2, 11)); // Mon Mar 11
    const prevSunday = getISOWeekKey(new Date(2024, 2, 10)); // Sun Mar 10
    expect(monday).not.toBe(prevSunday);
  });
});

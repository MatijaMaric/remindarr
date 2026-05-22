import { describe, expect, test } from "bun:test";
import { mapChangedFilesToTests } from "./changed-tests";

describe("mapChangedFilesToTests", () => {
  test("includes a changed .test.ts in the server bucket", () => {
    const result = mapChangedFilesToTests(
      ["server/foo/bar.test.ts"],
      () => true,
    );
    expect(result.server).toEqual(["server/foo/bar.test.ts"]);
    expect(result.frontend).toEqual([]);
  });

  test("maps a changed .ts source to its colocated .test.ts", () => {
    const result = mapChangedFilesToTests(
      ["server/foo/bar.ts"],
      (p) => p === "server/foo/bar.test.ts",
    );
    expect(result.server).toEqual(["server/foo/bar.test.ts"]);
  });

  test("omits source file when colocated test does not exist", () => {
    const result = mapChangedFilesToTests(["server/foo/bar.ts"], () => false);
    expect(result.server).toEqual([]);
  });

  test("omits a test file when exists returns false (e.g. deleted)", () => {
    const result = mapChangedFilesToTests(
      ["server/foo/bar.test.ts"],
      () => false,
    );
    expect(result.server).toEqual([]);
  });

  test("maps a changed .tsx source to its colocated .test.tsx", () => {
    const result = mapChangedFilesToTests(
      ["frontend/src/components/Foo.tsx"],
      (p) => p === "frontend/src/components/Foo.test.tsx",
    );
    expect(result.frontend).toEqual(["src/components/Foo.test.tsx"]);
    expect(result.server).toEqual([]);
  });

  test("maps a changed frontend .ts source to its colocated .test.ts", () => {
    const result = mapChangedFilesToTests(
      ["frontend/src/utils/helper.ts"],
      (p) => p === "frontend/src/utils/helper.test.ts",
    );
    expect(result.frontend).toEqual(["src/utils/helper.test.ts"]);
  });

  test("returns frontend paths relative to frontend/ (strips prefix)", () => {
    const result = mapChangedFilesToTests(
      ["frontend/src/pages/HomePage.test.tsx"],
      () => true,
    );
    expect(result.frontend).toEqual(["src/pages/HomePage.test.tsx"]);
  });

  test("ignores non-ts/tsx files (.css, .json, .md, .yml)", () => {
    const result = mapChangedFilesToTests(
      ["frontend/src/style.css", "README.md", "package.json", "lefthook.yml"],
      () => true,
    );
    expect(result.server).toEqual([]);
    expect(result.frontend).toEqual([]);
  });

  test("ignores files outside server/ and frontend/ (e2e, evals, root)", () => {
    const result = mapChangedFilesToTests(
      ["e2e/foo.test.ts", "evals/bar.test.ts", "root.test.ts"],
      () => true,
    );
    expect(result.server).toEqual([]);
    expect(result.frontend).toEqual([]);
  });

  test("deduplicates when both a source file and its test are changed", () => {
    const result = mapChangedFilesToTests(
      ["server/foo/bar.ts", "server/foo/bar.test.ts"],
      () => true,
    );
    expect(result.server).toEqual(["server/foo/bar.test.ts"]);
  });

  test("handles multiple changed files across both buckets", () => {
    const result = mapChangedFilesToTests(
      [
        "server/routes/titles.ts",
        "server/routes/titles.test.ts",
        "frontend/src/pages/HomePage.test.tsx",
        "package.json",
      ],
      (p) =>
        p === "server/routes/titles.test.ts" ||
        p === "frontend/src/pages/HomePage.test.tsx",
    );
    expect(result.server).toEqual(["server/routes/titles.test.ts"]);
    expect(result.frontend).toEqual(["src/pages/HomePage.test.tsx"]);
  });
});

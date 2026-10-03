import { expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkToolchain } from "./check-toolchain";

it("rejects compiler drift in either workspace with a repair instruction", () => {
  const root = mkdtempSync(join(process.cwd(), ".toolchain-test-"));
  try {
    for (const dir of [root, join(root, "frontend")]) {
      mkdirSync(join(dir, "node_modules/typescript"), { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ devDependencies: { typescript: "6.0.3" } }),
      );
      writeFileSync(
        join(dir, "node_modules/typescript/package.json"),
        JSON.stringify({ version: dir === root ? "6.0.3" : "7.0.2" }),
      );
    }
    expect(() => checkToolchain(pathToFileURL(root + "/"))).toThrow(
      "bun install --frozen-lockfile",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

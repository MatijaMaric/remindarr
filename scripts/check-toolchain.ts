import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

export function checkToolchain(root = new URL("../", import.meta.url)) {
  const rootManifest = JSON.parse(
    readFileSync(new URL("package.json", root), "utf8"),
  );
  const expected = rootManifest.devDependencies.typescript;
  for (const directory of ["", "frontend/"]) {
    const manifest = new URL(`${directory}package.json`, root);
    const declared = JSON.parse(readFileSync(manifest, "utf8")).devDependencies
      .typescript;
    const installed = createRequire(manifest)(
      "typescript/package.json",
    ).version;
    if (declared !== expected || installed !== expected) {
      throw new Error(
        `TypeScript drift in ${directory || "root"}: expected ${expected}, declared ${declared}, installed ${installed}. Remove root and frontend node_modules, then run bun install --frozen-lockfile from the repository root.`,
      );
    }
  }
}

if (import.meta.main) checkToolchain();

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Neutrals and the accent are design tokens (see index.css): bg-card,
// text-muted-foreground, border-border, bg-primary … A raw palette class
// ignores the theme and the person's accent setting, and used to need a
// per-theme override in index.css to stay legible.
const RAW_PALETTE =
  /(?<![\w-])(?:bg|text|border|ring|ring-offset|from|to|via|divide|outline|fill|stroke|placeholder|decoration)-(?:zinc|amber|slate|gray|neutral|stone)-\d{2,3}(?![\w-])/g;

const SRC = import.meta.dir;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && path !== import.meta.path
      ? [path]
      : [];
  });
}

describe("design tokens", () => {
  it("no source file uses a raw neutral or amber palette class", () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const found = readFileSync(file, "utf8").match(RAW_PALETTE) ?? [];
      return found.length
        ? [`${relative(SRC, file)}: ${[...new Set(found)].join(", ")}`]
        : [];
    });
    expect(offenders).toEqual([]);
  });

  it("every theme defines the surfaces it is known by", () => {
    const css = readFileSync(join(SRC, "index.css"), "utf8");
    for (const theme of ["light", "oled", "midnight", "moss", "plum"]) {
      const block = css.match(
        new RegExp(`:root\\.theme-${theme} \\{([^}]*)\\}`),
      )?.[1];
      expect(block).toContain("--background:");
      expect(block).toContain("--card:");
    }
  });
});

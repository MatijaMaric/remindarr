import { describe, it, expect } from "bun:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  buildCookieHeader,
  LIGHTHOUSE_BASE_URL,
  PAGE_GROUPS,
  FORM_FACTORS,
} from "./lighthouse-ci.helpers";

// ── buildCookieHeader ──────────────────────────────────────────────────────────

describe("buildCookieHeader", () => {
  it("extracts name=value from a single cookie with attributes", () => {
    const result = buildCookieHeader([
      "better-auth.session_token=abc123; Path=/; HttpOnly; SameSite=Lax",
    ]);
    expect(result).toBe("better-auth.session_token=abc123");
  });

  it("joins multiple Set-Cookie values into one Cookie header", () => {
    const result = buildCookieHeader([
      "__Secure-token=xyz; Secure; HttpOnly",
      "other=val; Path=/",
    ]);
    expect(result).toBe("__Secure-token=xyz; other=val");
  });

  it("returns empty string for an empty array", () => {
    expect(buildCookieHeader([])).toBe("");
  });

  it("handles a cookie with no attributes", () => {
    expect(buildCookieHeader(["session=tok123"])).toBe("session=tok123");
  });
});

// ── PAGE_GROUPS / FORM_FACTORS constants ──────────────────────────────────────

describe("PAGE_GROUPS", () => {
  it("public group contains Home, Browse, and title-detail", () => {
    const urls = PAGE_GROUPS.public;
    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/browse"))).toBe(true);
    expect(urls.some((u) => u.includes("/title/movie-"))).toBe(true);
  });

  it("auth group contains Settings and Calendar", () => {
    const urls = PAGE_GROUPS.auth;
    expect(urls.some((u) => u.endsWith("/settings"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/calendar"))).toBe(true);
  });

  it("all URLs are absolute and point to LIGHTHOUSE_BASE_URL", () => {
    for (const urls of Object.values(PAGE_GROUPS)) {
      for (const url of urls) {
        expect(url.startsWith(LIGHTHOUSE_BASE_URL)).toBe(true);
      }
    }
  });
});

describe("FORM_FACTORS", () => {
  it("contains mobile and desktop", () => {
    expect(FORM_FACTORS).toContain("mobile");
    expect(FORM_FACTORS).toContain("desktop");
  });
});

// ── lighthouserc.cjs config ───────────────────────────────────────────────────

const configPath = resolve(import.meta.dir, "../lighthouserc.cjs");
const req = createRequire(import.meta.url);

type LhciConfig = {
  ci: {
    collect: {
      url: string[];
      numberOfRuns: number;
      settings: Record<string, unknown>;
    };
    assert: { assertions: Record<string, unknown[]> };
    upload: { target: string; outputDir: string };
  };
};

function loadConfig(env: Record<string, string | undefined>): LhciConfig {
  delete req.cache[configPath];
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return req(configPath) as LhciConfig;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("lighthouserc.cjs", () => {
  const baseEnv = {
    LH_URLS: `${LIGHTHOUSE_BASE_URL}/`,
    LH_PRESET: "mobile",
    LH_OUTPUT_DIR: "/tmp/lhci-test",
    LH_COOKIE: undefined,
  };

  it("splits LH_URLS on commas to produce the url array", () => {
    const cfg = loadConfig({
      ...baseEnv,
      LH_URLS: `${LIGHTHOUSE_BASE_URL}/,${LIGHTHOUSE_BASE_URL}/browse`,
    });
    expect(cfg.ci.collect.url).toEqual([
      `${LIGHTHOUSE_BASE_URL}/`,
      `${LIGHTHOUSE_BASE_URL}/browse`,
    ]);
  });

  it("mobile preset: no preset key in settings", () => {
    const cfg = loadConfig({ ...baseEnv, LH_PRESET: "mobile" });
    expect(cfg.ci.collect.settings.preset).toBeUndefined();
  });

  it("desktop preset: settings.preset is 'desktop'", () => {
    const cfg = loadConfig({ ...baseEnv, LH_PRESET: "desktop" });
    expect(cfg.ci.collect.settings.preset).toBe("desktop");
  });

  it("no extraHeaders when LH_COOKIE is unset", () => {
    const cfg = loadConfig({ ...baseEnv, LH_COOKIE: undefined });
    expect(cfg.ci.collect.settings.extraHeaders).toBeUndefined();
  });

  it("includes Cookie in extraHeaders when LH_COOKIE is set", () => {
    const cfg = loadConfig({
      ...baseEnv,
      LH_COOKIE: "better-auth.session_token=tok",
    });
    expect(cfg.ci.collect.settings.extraHeaders).toEqual({
      Cookie: "better-auth.session_token=tok",
    });
  });

  it("all four categories are asserted at warn level", () => {
    const { assertions } = loadConfig(baseEnv).ci.assert;
    for (const key of [
      "categories:performance",
      "categories:accessibility",
      "categories:best-practices",
      "categories:seo",
    ]) {
      expect(assertions[key][0]).toBe("warn");
    }
  });

  it("performance threshold is 0.9", () => {
    const { assertions } = loadConfig(baseEnv).ci.assert;
    expect(
      (assertions["categories:performance"][1] as { minScore: number })
        .minScore,
    ).toBe(0.9);
  });

  it("accessibility threshold is 0.95", () => {
    const { assertions } = loadConfig(baseEnv).ci.assert;
    expect(
      (assertions["categories:accessibility"][1] as { minScore: number })
        .minScore,
    ).toBe(0.95);
  });

  it("upload target is filesystem", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.ci.upload.target).toBe("filesystem");
    expect(cfg.ci.upload.outputDir).toBe("/tmp/lhci-test");
  });
});

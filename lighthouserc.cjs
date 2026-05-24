// Parameterized lhci config — invoked once per (formFactor × pageGroup) run
// by scripts/lighthouse-ci.ts. All values come from environment variables set
// by the orchestration script so a single file covers all four matrix cells.
//
// To flip from warn-only to blocking: change "warn" → "error" in assertions
// and add the lighthouse job to the all-passed gate in .github/workflows/test.yml.

const cookie = process.env.LHCI_COOKIE;
const preset = process.env.LHCI_PRESET === "desktop" ? "desktop" : undefined;

/** @type {import('@lhci/cli').LighthouseConfig} */
module.exports = {
  ci: {
    collect: {
      url: (process.env.LHCI_URLS || "").split(",").map((u) => u.trim()),
      numberOfRuns: 1,
      settings: {
        ...(preset ? { preset } : {}),
        ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
        // Skip PWA category — it measures service-worker features, not UX quality.
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      },
    },
    assert: {
      // Phase 1 (warn-only): all assertions are non-blocking warnings.
      // Phase 2 follow-up: change "warn" → "error" to enforce as a hard gate.
      assertions: {
        "categories:performance": ["warn", { minScore: 0.9 }],
        "categories:accessibility": ["warn", { minScore: 0.95 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: process.env.LHCI_OUTPUT_DIR || ".lighthouseci",
    },
  },
};

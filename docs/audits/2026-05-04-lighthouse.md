# Lighthouse Baseline Audit — 2026-05-04

## Overview

First structured Lighthouse audit for Remindarr (#505). Pages audited: Home, Browse, Title Detail, Settings, Calendar, and Profile — desktop and mobile form factors each.

Raw JSON reports: captured locally at `D:\dev\lighthouse\remindarr\20260504\` (not committed — ~10 MB of JSON).

Tool: Chrome Lighthouse 12.x via `chrome://` Lighthouse panel. Pages loaded in logged-in state (user: `sirslani`). Desktop emulation: 1920×1080, no throttling. Mobile emulation: Moto G4 equivalent, Fast 4G.

---

## Score Snapshot

| Page         | Form factor | Perf | A11y | Best Practices | SEO |
|--------------|-------------|------|------|----------------|-----|
| Home         | desktop     | 72   | 85   | 77             | 83  |
| Home         | mobile      | 77   | 96   | 81             | 83  |
| Browse       | desktop     | 74   | 96   | 81             | 83  |
| Browse       | mobile      | 76   | 96   | 81             | 83  |
| Title detail | desktop     | 76   | 89   | 81             | 83  |
| Title detail | mobile      | 74   | 89   | 81             | 83  |
| Settings     | desktop     | 83   | 81   | 81             | 82  |
| Settings     | mobile      | 87   | 81   | 81             | 82  |
| Calendar     | desktop     | 99   | 88   | 81             | 82  |
| Calendar     | mobile      | 75   | 92   | 81             | 83  |
| Profile      | desktop     | 78   | 92   | 81             | 83  |
| Profile      | mobile      | 72   | 92   | 81             | 83  |

Worst single score: Home/Profile mobile perf (72), Settings a11y (81).

---

## Regression Thresholds

The following thresholds apply to all five mandated pages (Home, Browse, Title Detail, Settings, Calendar) on **both desktop and mobile**. A score below any threshold is a regression and should block release.

| Category       | Threshold |
|----------------|-----------|
| Performance    | ≥ 90      |
| Accessibility  | ≥ 95      |
| Best Practices | ≥ 90      |
| SEO            | ≥ 90      |

Current scores are below threshold across the board. Each follow-up issue below is a step toward meeting these targets. Once #697 (Lighthouse CI) lands, thresholds will be enforced automatically in CI.

---

## Findings and Follow-up Issues

### Accessibility

| Audit | Pages affected | Follow-up |
|-------|---------------|-----------|
| `button-name` — carousel pagination dots have no accessible name | Home, Title detail | [#682](https://github.com/MatijaMaric/remindarr/issues/682) |
| `target-size` — pagination dots are 8×4 px (min: 24×24 px) | Home, Title detail | [#682](https://github.com/MatijaMaric/remindarr/issues/682) |
| `label-content-name-mismatch` — nav search `aria-label="Search"` doesn't contain visible text | All pages | [#683](https://github.com/MatijaMaric/remindarr/issues/683) |
| `label` + `select-name` — Settings form inputs and country `<select>` have no `<label>` association | Settings | [#684](https://github.com/MatijaMaric/remindarr/issues/684) |
| `button-name` — `SToggle` (role=switch) without accessible name | Settings | [#685](https://github.com/MatijaMaric/remindarr/issues/685) |
| SettingsSidebar tabs — no `role="tab"` / `aria-selected` (pre-existing, noted in #505 thread) | Settings | [#686](https://github.com/MatijaMaric/remindarr/issues/686) |
| `link-text` — BottomTabBar "More" link is non-descriptive | All pages (mobile) | [#687](https://github.com/MatijaMaric/remindarr/issues/687) |
| `color-contrast` — `text-zinc-500` and `opacity-60` on dark surfaces (44 nodes on Settings alone) | Home, Title detail, Settings | [#688](https://github.com/MatijaMaric/remindarr/issues/688) |

### Performance

| Audit | Pages affected | Follow-up |
|-------|---------------|-----------|
| `lcp-discovery-insight` — hero image has no `fetchpriority="high"`, not in initial document | Home | [#689](https://github.com/MatijaMaric/remindarr/issues/689) |
| `image-delivery-insight` — episode thumbnails use `w1280` for ~318×179 display (≥107 KB wasted/image) | Home, Title detail | [#690](https://github.com/MatijaMaric/remindarr/issues/690) |
| `unused-javascript` — Sentry Replay/Feedback/ReplayCanvas: ≈85 KB wasted bytes in `vendor-sentry-*.js` | All pages | [#691](https://github.com/MatijaMaric/remindarr/issues/691) |
| `render-blocking-insight` — `registerSW.js` is synchronous in `<head>` | All pages | [#692](https://github.com/MatijaMaric/remindarr/issues/692) |
| `legacy-javascript-insight` — `Array.from` polyfill shipped via Sentry chunk (~11 KB) | All pages | [#693](https://github.com/MatijaMaric/remindarr/issues/693) |
| `cumulative-layout-shift` — Home 0.45, Settings 0.37, Title detail 0.13 (target ≤0.1) | Home, Settings, Title detail | [#694](https://github.com/MatijaMaric/remindarr/issues/694) |

### Best Practices

| Audit | Pages affected | Follow-up |
|-------|---------------|-----------|
| `errors-in-console` — CORS errors for `image.tmdb.org` on every page load | All pages | [#695](https://github.com/MatijaMaric/remindarr/issues/695) |
| `deprecations` — `SharedStorage`, `StorageType.persistent`, `Fledge` from `cdn-cgi/challenge-platform` (Cloudflare Bot Fight) | All pages | Out of our control — documented, no action |

### SEO

| Audit | Pages affected | Follow-up |
|-------|---------------|-----------|
| `meta-description` — no `<meta name="description">` in `index.html` | All pages | [#696](https://github.com/MatijaMaric/remindarr/issues/696) |

### CI / Regression Guard

| Task | Follow-up |
|------|-----------|
| Set up Lighthouse CI to enforce thresholds on PRs targeting `master` | [#697](https://github.com/MatijaMaric/remindarr/issues/697) |

---

## Notes

- Best Practices score (77–81) is held down by the `deprecations` audit which traces entirely to Cloudflare's Bot Fight script (`cdn-cgi/challenge-platform/scripts/jsd/main.js`). This is not fixable from the app side. True app-level best-practices score is effectively 100.
- The `cache-insight` finding traces to the same Cloudflare CDN script (4-hour cache TTL). Out of our control.
- Browse page already scores 96 for a11y (mobile + desktop). The home page logged-in state scoring 85 on desktop is largely driven by color-contrast and the pagination dots — both targeted by #682 and #688.
- Profile page included in this run for completeness; it is not in the mandated page set for the regression threshold.

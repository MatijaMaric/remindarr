## Summary

<!-- 1-3 bullets of what changed and why -->

## Linked issues

Closes #

## Test plan

- [ ] `bun run check` passes locally
- [ ] New/changed routes have zod validation + happy-path tests
- [ ] Migrations follow CF-D1 safety rules (no parent-table recreates — see `server/db/CLAUDE.md`)
- [ ] If touching notifications: `streamingAlerts.length` guard preserved

## Screenshots / recordings

<!-- For UI changes, include before/after screenshots or a short screen recording -->

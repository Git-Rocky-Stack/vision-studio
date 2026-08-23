## What this changes

<!-- What behaviour is different after this PR, from a user's point of view? -->

## Why

<!-- The problem being solved. Link the issue if there is one: Fixes #123 -->

## How it was verified

<!--
Not "it should work" - what did you actually run? Paste the result. For a bug
fix, name the test that fails without this change.
-->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Backend: `python -m pytest` (if `backend/` changed)

## Checklist

- [ ] New behaviour is covered by a test that failed before the change
- [ ] Visual or UI changes follow [`DESIGN.md`](../DESIGN.md) - Carbon Pro tokens, no stock Tailwind palette classes, no emoji in app source
- [ ] IPC channel names stay in sync between `electron/preload.ts` and its handler
- [ ] No secrets, API keys, or personal paths in the diff
- [ ] [`CHANGELOG.md`](../CHANGELOG.md) updated if this is user-facing

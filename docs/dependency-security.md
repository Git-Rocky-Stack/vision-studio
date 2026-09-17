# Dependency Security Policy & Audit Exceptions

_Last reviewed: 2026-09-13_

Vision Studio ships as a packaged Electron desktop app. The dependency-security
bar is therefore split into two tiers, because a vulnerability in a build-time
tool that never reaches a user's machine is categorically different from a
vulnerability in code we bundle and ship.

## Policy

1. **Shipped (production) dependencies must be audit-clean.**
   The production dependency tree is gated in CI by:

   ```bash
   npm audit --omit=dev --audit-level=high
   ```

   This audits only the packages that are bundled into the delivered app
   (everything under `dependencies` in `package.json`). It must exit `0`. Any
   new advisory affecting a shipped package fails the PR gate. Run it locally
   with `npm run audit:prod`.

2. **Dev / build-time advisories are tracked, documented exceptions.**
   Advisories that exist only in `devDependencies` (test, lint, and packaging
   tooling) do not block release, but every one is enumerated below with a
   justification and a remediation path. The full audit is available via
   `npm run audit:full` (`npm audit --audit-level=moderate`).

## Current State (2026-09-13)

| Audit | Result |
| --- | --- |
| `npm run audit:prod` — `npm audit --omit=dev --audit-level=high` (shipped) | **0 vulnerabilities** |
| `npm run audit:full` — `npm audit --audit-level=moderate` (all, incl. dev) | **0 vulnerabilities** |

There are currently **no accepted exceptions**: the whole tree is clean, not
just the shipped half. Two things had to change to get there, and both are
recorded below, because a clean audit line says nothing about *how* it was
reached.

### Shipped: the js-yaml override (GHSA-2883-xcg3-v3hh)

`js-yaml` 4.0.0 – 4.3.1 carries a HIGH advisory — `maxTotalMergeKeys` does not
bound CPU use for empty merge sources, so a crafted document can pin the parsing
thread. It reaches the shipped tree through exactly one package,
`electron-updater`, which calls `load()` at three sites. One of them is
`out/providers/Provider.js:97`, the parse of the **update feed fetched over the
network** — the parser standing between a hostile feed and the updater.

js-yaml published the 4.x patch as **4.3.2** on 2026-08-26, under dist-tag
`v4-legacy`; the advisory's own range is `>=4.0.0 <4.3.2`. Because
`electron-updater@6.8.9` — the latest stable, 7.x being alpha — declares
`js-yaml: ^4.1.0`, and 4.3.2 satisfies that range, a plain install already
resolves the shipped path to a patched parser. **No override is strictly
required to clear this advisory.** One is kept anyway, as a floor rather than a
substitution, so a future resolution cannot drift back below the patch on the
one code path that parses a network-fetched feed:

```json
"overrides": { "electron-updater": { "js-yaml": "^4.3.2" } }
```

3.4.0 shipped this as `^5.4.2`. That cleared the advisory, but it substituted a
major version of a YAML parser on the update path for no security gain, on the
mistaken basis that no 4.x fix existed. It was narrowed to the 4.x line once
4.3.2 was confirmed to be the patch.

The scoping is still deliberate: the override guarantees the floor where it
matters rather than binding `app-builder-lib` and the rest of the
electron-builder packaging toolchain, which is build-time code nothing here
exercises. In practice the root tree is on 4.3.2 as well, so electron-updater
dedupes onto it and there is exactly one js-yaml in the tree.

An override is a claim about what the install actually resolves, and nothing
else in the build would notice if that stopped being true. So
`tests/dependency-overrides.test.ts` holds it up: the override is declared and
scoped, the **installed** tree (not merely the declaration) resolves outside
the advisory range on the shipped path and at the root, and the resolved parser
still round-trips a real electron-updater feed through `load()` with numeric
scalars intact.

Checked against production: the three live feeds (`win/latest.yml`,
`mac/latest-mac.yml`, `linux/latest-linux.yml`) were fetched and parsed through
the resolved 4.3.2 — all three return version 3.4.0 with the expected keys
(re-run 2026-09-17). The 4.3.2-vs-5.4.2 deep-diff taken before the narrowing
was identical on all three, which is why dropping the 5.x copy carried no
behavioural risk.

### Dev: vitest and browserslist patch bumps

The four remaining advisories were dev-only and every one had an in-range patch
fix, so the fixes were taken rather than written up as exceptions:

| Package | Bump | Advisory |
| --- | --- | --- |
| `vitest`, `@vitest/mocker` | 4.1.8 → 4.1.11 | GHSA-82fw-gwwq-j7x9 — path traversal / arbitrary file read via the mocker redirect |
| `browserslist` | 4.28.1 → 4.28.9 | GHSA-c83g-rgw3-j3cx (unbounded cache growth → OOM), GHSA-73wf-gq98-2v4g (crash / prototype write via untrusted custom stats) |
| `baseline-browser-mapping` | 2.10.0 → 2.11.23 | GHSA-w5vr-8v7q-w6rv — process termination on invalid input |

### Previously tracked, now resolved

Earlier revisions of this file carried a standing exception for the
**`electron-builder@25`** tree — six `tar` advisories plus `brace-expansion` —
against a deferred remediation path of "upgrade electron-builder 25 → 26". That
upgrade has since landed: the repository builds on `electron-builder@26.15.3`
and none of those packages appear in the audit any more. The exception table is
deleted rather than left standing, because a stale exception reads as a live
risk that somebody has consciously chosen to accept.

Verify the current classification at any time:

```bash
npm run audit:prod      # shipped tree; the CI gate
npm run audit:full      # whole tree, dev tooling included
npm ls js-yaml --all    # one copy: 4.3.2, shared by the shipped path and dev
```

## Review Cadence

Re-run `npm run audit:full` and refresh this file's "Current State" table on
every dependency change and at minimum each release. If a new advisory lands on
a **shipped** package, it is a release blocker, not an exception — fix it.

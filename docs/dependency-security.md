# Dependency Security Policy & Audit Exceptions

_Last reviewed: 2026-06-08_

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

## Current State (2026-06-08)

| Audit | Result |
| --- | --- |
| `npm audit --omit=dev --audit-level=high` (shipped) | **0 vulnerabilities** |
| `npm audit --audit-level=moderate` (all, incl. dev) | 10 (1 moderate, 9 high) — all dev-only |

The most recent shipped-security action was upgrading **`react-router-dom`
7.13.0 → 7.17.0** (still v7, non-breaking), which cleared four HIGH and two
MODERATE React Router advisories (XSS, open redirect, DoS, and a
turbo-stream/RSC deserialization issue). React Router's server/RSC/single-fetch
runtime is not used by this app — the renderer uses it purely as a client-side
router — but the patched release was taken regardless to keep the shipped audit
clean.

## Accepted Dev-Only Exceptions

Every remaining advisory originates from the **`electron-builder@25` packaging
toolchain** (installer builders) plus transitive `brace-expansion` copies in dev
glob tooling. None of these packages are bundled into the shipped application;
they execute only at `npm run package` / CI build time on developer and CI
machines.

| Package | Severity | Root advisory | Why non-shipped / low real risk |
| --- | --- | --- | --- |
| `tar` | HIGH (x6) | GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, GHSA-qffp-2rhf-9h96, GHSA-9ppj-qmqm-q256, GHSA-r6q2-hw4h-h46w | Hardlink/symlink path-traversal + APFS race on archive **extraction**. Pulled in by `node-gyp`/`cacache` under electron-builder. The only archives extracted during packaging are Electron's own prebuilt binaries from trusted sources. |
| `node-gyp`, `make-fetch-happen`, `cacache` | HIGH | depend on vulnerable `tar` | Native-rebuild toolchain under `@electron/rebuild`; build-time only. |
| `@electron/rebuild`, `app-builder-lib`, `dmg-builder`, `electron-builder`, `electron-builder-squirrel-windows` | HIGH | depend on vulnerable `tar` | electron-builder@25 installer pipeline; devDependency, never shipped. |
| `brace-expansion` | MODERATE | GHSA-f886-m6hf-6m8v (ReDoS / process hang) | Transitive in dev `minimatch` copies (electron-builder, eslint, rimraf, typescript-eslint). Exploit needs adversary-controlled glob patterns; the only patterns are developer-authored build globs. |

Verify the dev-only classification at any time:

```bash
npm ls tar brace-expansion          # every path resolves under a devDependency
npm audit --omit=dev --audit-level=high   # shipped tree stays clean
```

## Remediation Path (Deferred, Tracked)

The single fix that clears all nine electron-builder-tree advisories is a
**breaking major upgrade: `electron-builder` 25 → 26** (`npm audit fix --force`
installs `electron-builder@26.15.2`). electron-builder 26 ships the patched
`tar`/`@electron/rebuild` toolchain.

This is deliberately deferred to a **dedicated upgrade effort**, mirroring how
the Electron 33 → 42 runtime upgrade was handled separately, because the
electron-builder major changes the NSIS installer pipeline, `app-builder-lib`
APIs, and code-signing flow. It must be verified with a full signed Windows
packaging smoke (see `docs/code-signing.md`) rather than folded into an
unrelated change.

**Acceptance:** the audit report's P0 dependency criterion — _"exits cleanly OR
only leaves explicitly documented, non-shipped dev-only exceptions"_ — is met:
the shipped tree is clean and enforced in CI, and the dev-only residue is
enumerated here with an owner and a path.

## Review Cadence

Re-run `npm run audit:full` and refresh this file's "Current State" table on
every dependency change and at minimum each release. If a new advisory lands on
a **shipped** package, it is a release blocker, not an exception — fix it.

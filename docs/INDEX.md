# Vision Studio — Documentation Index

> Authoritative entry point for technical documentation. Start here.

## Core reference

| Document | What it covers |
|----------|----------------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Process model, source layout, frontend/main/backend stack, data flows, persistence, security, build, release, testing. **Start here.** |
| [`API_ENDPOINTS.md`](./API_ENDPOINTS.md) | Complete reference for the three API surfaces: Electron IPC (`window.electron.*`), backend REST + WebSocket, OpenRouter integration. |
| [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) | SQLite schema, ER diagram, migration runner, how to add a migration safely. |
| [`api/openapi.json`](./api/openapi.json) | Machine-readable OpenAPI 3.0 spec for the backend REST API. Pair with Swagger UI / Redoc / OpenAPI Generator. |
| [`diagrams/diagrams.md`](./diagrams/diagrams.md) | Standalone Mermaid diagrams (process model, generation flows, settings restart, asset I/O, job lifecycle, ER, first launch, release pipeline). |

## Top-level project docs

| Document | What it covers |
|----------|----------------|
| [`../README.md`](../README.md) | Install, quickstart, supported GPUs, troubleshooting. |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Dev environment, local commands, code style, PR process. |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Versioned release notes. |
| [`../BUNDLING.md`](../BUNDLING.md) | Packaging the Python backend with PyInstaller. |
| [`../DEPLOYMENT.md`](../DEPLOYMENT.md) | Distribution and updater notes. |
| [`../WINDOWS_BUILD.md`](../WINDOWS_BUILD.md) | Windows-specific build steps. |

## Audits & strategy (point-in-time snapshots)

These are dated working documents. Treat them as historical references for the date in the filename, not as authoritative specs.

| Document | Date |
|----------|------|
| [`accessibility-audit-2026-04-18.md`](./accessibility-audit-2026-04-18.md) | 2026-04-18 |
| [`code-quality-review-2026-04-17.md`](./code-quality-review-2026-04-17.md) | 2026-04-17 |
| [`code-signing.md`](./code-signing.md) | Reference |
| [`dependency-security.md`](./dependency-security.md) | Reference |
| [`competitive-analysis-2026-04.md`](./competitive-analysis-2026-04.md) | 2026-04 |
| [`handoff-2026-04-17.md`](./handoff-2026-04-17.md) | 2026-04-17 |
| [`handoff-2026-04-19.md`](./handoff-2026-04-19.md) | 2026-04-19 |
| [`performance-audit-2026-04-18.md`](./performance-audit-2026-04-18.md) | 2026-04-18 |
| [`qa-audit-2026-04-18.md`](./qa-audit-2026-04-18.md) | 2026-04-18 |
| [`qa-testing-strategy.md`](./qa-testing-strategy.md) | Reference |
| [`../SECURITY-AUDIT-2026-04-18.md`](../SECURITY-AUDIT-2026-04-18.md) | 2026-04-18 |
| [`../AUDIT_2026-04-12.md`](../AUDIT_2026-04-12.md) | 2026-04-12 |

Plans live under [`plans/`](./plans/) and superpowers notes under [`superpowers/`](./superpowers/).

---

## Reading order by role

**Joining the team / first-time orientation**
1. `../README.md` (≤ 10 min)
2. `ARCHITECTURE.md` end-to-end (≤ 30 min)
3. `../CONTRIBUTING.md` (set up dev loop)
4. Trace one feature top-to-bottom — see the "Where to start as a new contributor" section in `ARCHITECTURE.md`.

**Adding a new endpoint / IPC channel**
1. `API_ENDPOINTS.md` — find the closest existing channel as a template.
2. `ARCHITECTURE.md §4.4` — make sure your inputs are validated through `security.ts` / `outputRoots.ts`.
3. Update both `API_ENDPOINTS.md` and `api/openapi.json` in the same PR as the implementation.

**Touching the database**
1. `DATABASE_SCHEMA.md §5` — adding a migration.
2. Update the migration history table in `DATABASE_SCHEMA.md §4.2`.
3. Bump `SCHEMA_VERSION` in `backend/db/schema_version.py`.

**Security review**
1. `ARCHITECTURE.md §8` (security model + threat table).
2. `../SECURITY-AUDIT-2026-04-18.md` (last formal audit).
3. `dependency-security.md` (shipped-vs-dev audit policy + tracked dev-only exceptions).
4. Read `electron/services/security.ts`, `outputRoots.ts`, `secureStore.ts`, `contentSecurityPolicy.ts`, and `backend/middleware/rate_limit.py` + `backend/utils/sanitization.py`.

**Release / packaging**
1. `../BUNDLING.md` and `../DEPLOYMENT.md`.
2. `ARCHITECTURE.md §9 + §11` (build pipeline + release flow diagram).
3. `docs/code-signing.md`.

---

_Maintained alongside the code. If you change a process boundary, schema, or public API, update the matching doc in the same PR. Stale docs are worse than missing docs._

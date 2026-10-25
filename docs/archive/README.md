# Audits, reviews and handoffs (archive)

Historical, point-in-time records: audits, code reviews, session handoffs, to-do
snapshots and one early plan. Each file is named `<date>-<slug>.md` and records
what its author found or intended on that date.

These are **not** product documentation, and they are not kept in step with the
code. A finding listed as open may have been fixed long ago; a count, file path
or line number may no longer exist; a "next step" may have shipped differently
or been dropped. Read them as evidence of the state of the project on the date
in the filename, never as a description of how Vision Studio behaves today.

For the authoritative picture, start at [`../INDEX.md`](../INDEX.md).

Every record in this directory opens with a banner repeating this framing (and
naming the path it lived at before it was archived), so it still reaches a
reader who arrives directly at a single file. `tests/docs-provenance.test.ts`
enforces the naming and the banner.

| Record | Date | Formerly |
|--------|------|----------|
| [Application audit](./2026-04-12-application-audit.md) | 2026-04-12 | `AUDIT_2026-04-12.md` |
| [Code quality review](./2026-04-17-code-quality-review.md) | 2026-04-17 | `docs/code-quality-review-2026-04-17.md` |
| [Session handoff](./2026-04-17-handoff.md) | 2026-04-17 | `docs/handoff-2026-04-17.md` |
| [Accessibility audit (WCAG 2.1 AA)](./2026-04-18-accessibility-audit.md) | 2026-04-18 | `docs/accessibility-audit-2026-04-18.md` |
| [Performance audit](./2026-04-18-performance-audit.md) | 2026-04-18 | `docs/performance-audit-2026-04-18.md` |
| [QA audit](./2026-04-18-qa-audit.md) | 2026-04-18 | `docs/qa-audit-2026-04-18.md` |
| [Security audit](./2026-04-18-security-audit.md) | 2026-04-18 | `SECURITY-AUDIT-2026-04-18.md` |
| [Session handoff (Phase 4-5)](./2026-04-19-handoff.md) | 2026-04-19 | `docs/handoff-2026-04-19.md` |
| [Design rollout handoff](./2026-05-29-design-rollout-handoff.md) | 2026-05-29 | `DESIGN_ROLLOUT_HANDOFF.md` |
| [Comprehensive audit](./2026-06-03-comprehensive-audit.md) | 2026-06-03 | `docs/comprehensive-audit-2026-06-03.md` |
| [Remaining to-dos snapshot](./2026-07-04-current-todos.md) | 2026-07-04 | `docs/current-todos-2026-07-04.md` |
| [Backend integration plan](./2026-08-23-backend-integration-plan.md) | undated; first seen 2026-08-23 | `BACKEND_PLAN.md` |

Design specs and implementation plans live in [`../plans/`](../plans/) and
[`../superpowers/`](../superpowers/), under the same rules.

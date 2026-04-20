# Release Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the remaining release risks into explicit release gates, a safe encrypted store migration, and quiet passing tests.

**Architecture:** Keep release credential material out of source control. Add deterministic preflight logic for signing readiness, isolate Electron store encryption/migration behind a small main-process module, and centralize test-environment shims in `tests/setup.ts`.

**Tech Stack:** Electron 33, electron-store 10, electron-builder 25, Vitest 3, React Testing Library, GitHub Actions.

---

### Task 1: Release Signing Preflight

**Files:**
- Create: `scripts/verify-release-signing.cjs`
- Modify: `package.json`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/code-signing.md`

**Steps:**
1. Write tests or a CLI self-test path for unsigned, PFX/CSC, certificate store, and Azure Trusted Signing inputs.
2. Verify the self-test fails for missing credentials.
3. Implement the preflight script with clear failure messages and no secret logging.
4. Wire tagged Windows release builds to run the preflight before packaging.
5. Document required secrets and local verification commands.

### Task 2: Safe Electron Store Encryption Migration

**Files:**
- Create: `electron/services/secureStore.ts`
- Create: `electron/services/secureStore.test.ts`
- Modify: `electron/main.ts`

**Steps:**
1. Write failing tests for key creation, plaintext backup, encrypted rewrite, unavailable safeStorage fallback, and backup failure handling.
2. Implement minimal secure-store factory and migration helper.
3. Replace direct `new Store(...)` in `electron/main.ts` with the secure factory.
4. Run targeted tests and typecheck.

### Task 3: Test stderr Noise Cleanup

**Files:**
- Modify: `tests/setup.ts`
- Modify: `src/components/ui/Input.test.tsx`
- Modify: `src/components/ui/Textarea.test.tsx`
- Possibly modify: `src/store/appStore.ts`

**Steps:**
1. Reproduce each noisy targeted test.
2. Add jsdom `scrollTo` shim in setup.
3. Update controlled read-only fixtures to state their read-only intent.
4. Add a storage shim or explicit Zustand storage provider so node tests persist to memory.
5. Run targeted tests, then the full suite.

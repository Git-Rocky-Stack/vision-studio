# Vision Studio - Comprehensive Security Audit Report

**Date:** 2026-04-18
**Scope:** Electron + React desktop application, full codebase
**Framework:** OWASP Top 10 for Desktop Applications

---

## Executive Summary

The application demonstrates strong security fundamentals: contextIsolation enabled, nodeIntegration disabled, proper contextBridge usage, and path traversal protections on asset handlers. However, there are 12 findings (4 P1, 4 P2, 4 P3) that require attention. The most urgent are sandbox being disabled, missing CSP, unvalidated shell.openExternal, and command injection via pythonPath.

### Remediation Update - 2026-04-19

The audit remediation pass resolved the actionable P1/P2 items and most P3 items, with one residual release-process item and one deliberate data-migration follow-up:

| ID | Status | Notes |
|----|--------|-------|
| 01 | Fixed | `BrowserWindow` now uses `sandbox: true`. |
| 02 | Fixed | CSP is present in `index.html` and enforced from Electron via `session.defaultSession.webRequest.onHeadersReceived`. |
| 03 | Fixed | `app:open-external` now accepts only `http:` and `https:` URLs. |
| 04 | Fixed | `pythonPath` is validated against shell metacharacters and non-Python executables before `spawn()`. |
| 05 | Fixed | `assets:export` destinations must be absolute paths inside approved user export roots. |
| 06 | Fixed | Generic store IPC is restricted to an allow-list of known keys. |
| 07 | Fixed | Generation/model IPC handlers log raw backend details in the main process and return sanitized renderer messages. |
| 08 | Fixed | `electron-store` now uses a `safeStorage`-protected encryption key when OS encryption is available, backs up plaintext config before the first encrypted rewrite, and falls back without rewriting if encryption or backup is unavailable. |
| 09 | Release-gated | `verifyUpdateCodeSignature` is enabled and tagged Windows releases now fail closed unless signing credentials are configured; actual certificate/HSM secrets remain external release credentials. |
| 10 | Fixed | `will-navigate` and `setWindowOpenHandler` deny renderer navigation/window escapes. |
| 11 | Fixed | Electron now launches the backend with a per-process token, sends it on API requests, and adds it to the WebSocket URL. Generated `/outputs` assets remain public so media elements can render them directly. |
| 12 | Fixed | `assets:export-many` destinations use the same approved-root validation as single export. |

Verification completed:

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm test` passed: 70 files, 653 tests.
- `python -m py_compile backend/main.py` passed.

---

## Findings

### FINDING 01: Sandbox Mode Disabled
- **OWASP Category:** A05 - Security Misconfiguration
- **Severity:** P1 - Critical
- **File:** electron/main.ts:397
- **Detail:** sandbox: false in webPreferences.
- **Attack Vector:** Renderer compromise gets broader Node.js API access.
- **Mitigation:** Set sandbox: true.

### FINDING 02: No Content Security Policy
- **OWASP Category:** A05 - Security Misconfiguration
- **Severity:** P1 - Critical
- **File:** electron/main.ts (missing), index.html (missing)
- **Detail:** No CSP header or meta tag anywhere.
- **Attack Vector:** XSS allows unrestricted script loading and data exfiltration.
- **Mitigation:** Add CSP via session.defaultSession.webRequest.onHeadersReceived.

### FINDING 03: Unvalidated shell.openExternal
- **OWASP Category:** A01 - Broken Access Control
- **Severity:** P1 - Critical
- **File:** electron/main.ts:467-469
- **Detail:** app:open-external passes user URLs directly to shell.openExternal() without validation.
- **Attack Vector:** file://, smb://, javascript: URLs execute arbitrary programs.
- **Mitigation:** Restrict to http: and https: protocols only.

### FINDING 04: Command Injection via pythonPath
- **OWASP Category:** A03 - Injection
- **Severity:** P1 - Critical
- **File:** electron/main.ts:175-188
- **Detail:** pythonPath setting used directly in spawn() without validation.
- **Attack Vector:** Renderer can set pythonPath to cmd.exe or powershell.exe for full command execution.
- **Mitigation:** Validate against disallowed executables and verify file is a legitimate Python binary.

### FINDING 05: Path Traversal in assets:export Destination
- **OWASP Category:** A01 - Broken Access Control
- **Severity:** P2 - High
- **File:** electron/main.ts:546-558
- **Detail:** destinationPath not validated; sourcePath is validated but destination is arbitrary.
- **Mitigation:** Validate destination paths against system directories.

### FINDING 06: Arbitrary Store Read/Write via IPC
- **OWASP Category:** A01 - Broken Access Control
- **Severity:** P2 - High
- **File:** electron/main.ts:492-502
- **Detail:** store:get/set accept arbitrary key/value with no runtime validation.
- **Mitigation:** Whitelist allowed keys and validate settings shape.

### FINDING 07: Error Messages Leak Internal Details
- **OWASP Category:** A04 - Insecure Design
- **Severity:** P3 - Medium
- **File:** electron/ipc-handlers/generation.ts (11 locations)
- **Detail:** Raw error.message and error.response data returned to renderer.
- **Mitigation:** Sanitize errors; log details on main process side only.

### FINDING 08: electron-store Data Not Encrypted
- **OWASP Category:** A02 - Cryptographic Failures
- **Severity:** P3 - Medium
- **File:** electron/main.ts:43-51
- **Detail:** Store initialized without encryptionKey; plaintext JSON in AppData.
- **Mitigation:** Enable encryptionKey or use safeStorage API.

### FINDING 09: Code Signing Disabled, Update Verification Off
- **OWASP Category:** A05 - Security Misconfiguration
- **Severity:** P2 - High
- **File:** electron-builder.yml:65
- **Detail:** verifyUpdateCodeSignature: false; signing config commented out; placeholder publisher.
- **Attack Vector:** MITM could serve malicious updates.
- **Mitigation:** Obtain EV certificate, enable signing, set verifyUpdateCodeSignature: true.

### FINDING 10: No Navigation Security Event Handlers
- **OWASP Category:** A05 - Security Misconfiguration
- **Severity:** P3 - Medium
- **File:** electron/main.ts:380-418
- **Detail:** No will-navigate or setWindowOpenHandler registered.
- **Mitigation:** Add will-navigate to prevent navigation and setWindowOpenHandler for external links.

### FINDING 11: Backend Communication Unencrypted, No Auth
- **OWASP Category:** A02 - Cryptographic Failures
- **Severity:** P3 - Medium
- **File:** electron/ipc-handlers/generation.ts:5-6
- **Detail:** Plain HTTP and unauthenticated WebSocket to localhost backend.
- **Attack Vector:** Any local process can connect and submit requests.
- **Mitigation:** Add random auth token; consider Unix domain socket.

### FINDING 12: assets:export-many Destination Not Validated
- **OWASP Category:** A01 - Broken Access Control
- **Severity:** P2 - High
- **File:** electron/main.ts:560-587
- **Detail:** destinationDir parameter user-controlled and not validated.
- **Mitigation:** Same as Finding 05.

---

## Positive Observations

1. contextIsolation: true enabled
2. nodeIntegration: false correctly set
3. contextBridge properly limits API surface
4. Source path traversal protections in place
5. No dangerouslySetInnerHTML in source
6. No innerHTML in app code
7. No @electron/remote usage
8. No eval() or Function() execution
9. No iframe/webview/embed elements
10. IPC guard prevents duplicate handler registration
11. .gitignore excludes .env files
12. asInvoker execution level (no admin required)

---

## Risk Summary

| ID | Sev | OWASP | Finding |
|----|-----|-------|---------|
| 01 | P1 | A05 | Sandbox mode disabled |
| 02 | P1 | A05 | No Content Security Policy |
| 03 | P1 | A01 | Unvalidated shell.openExternal |
| 04 | P1 | A03 | Command injection via pythonPath |
| 05 | P2 | A01 | Path traversal: assets:export destination |
| 06 | P2 | A01 | Arbitrary store read/write via IPC |
| 07 | P3 | A04 | Error messages leak internal details |
| 08 | P3 | A02 | electron-store not encrypted at rest |
| 09 | P2 | A05 | Code signing disabled, update verification off |
| 10 | P3 | A05 | No navigation security handlers |
| 11 | P3 | A02 | Backend: unencrypted, unauthenticated |
| 12 | P2 | A01 | assets:export-many destination not validated |

---

## Prioritized Remediation

### Immediate (P1)
1. sandbox: true in webPreferences
2. CSP via session.defaultSession.webRequest
3. Validate shell.openExternal URLs (http/https only)
4. Sanitize pythonPath against disallowed executables

### Short-Term (P2, within 2 weeks)
5. Validate destination paths in assets:export and assets:export-many
6. Runtime validation for store:get/store:set IPC
7. Enable code signing, verifyUpdateCodeSignature: true

### Medium-Term (P3, within 1 month)
8. Sanitize backend error messages to renderer
9. Keep release signing credentials provisioned in CI/CD secrets
10. Add will-navigate and setWindowOpenHandler guards
11. Add auth token for backend API/WebSocket

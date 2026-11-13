# Security Policy

Vision Studio runs generative models on your own hardware, packages a native
Python runtime, and downloads model weights from third-party hosts. That makes
its security surface unusual for a desktop app, so this policy is specific about
what we consider a vulnerability and how we handle one.

## Supported Versions

Only the latest release receives security fixes. Vision Studio ships as a
single stable line with an auto-update feed; there are no maintained LTS
branches. The latest published release is **v3.4.1**; **3.5.0** is the upcoming
release and is not yet published.

| Version | Supported |
| ------- | --------- |
| 3.5.x   | Once 3.5.0 is published |
| 3.4.x   | Yes - the latest published release |
| < 3.4   | No - update to the latest release |

Check your version in **Settings -> About**. Windows builds are code-signed
from 3.5.0 on (Azure Artifact Signing, publisher `Sharif Elsalaymeh`); v3.4.1 and
earlier are unsigned. The Windows updater refuses any update whose signature does
not resolve to the expected publisher (see
[What We Ship, and How It Is Checked](#what-we-ship-and-how-it-is-checked)), so a
3.4.x install cannot update itself to 3.5.0: download it once from
[vision-studio-x.com/download](https://vision-studio-x.com/download), and later
signed updates install in the app. The updater is switched off on macOS, whose
builds are only ad-hoc signed; update there by downloading the latest version.

## Reporting a Vulnerability

**Email [security@vision-studio-x.com](mailto:security@vision-studio-x.com).
Do not open a public issue.**

Please include:

- The version, OS, and GPU you reproduced on
- What an attacker gains - code execution, file read/write outside the app,
  credential disclosure, or bypass of a consent gate
- Reproduction steps or a proof of concept
- Any relevant logs (redact paths and tokens first). The backend writes
  `logs/backend.log` inside the app's user-data folder (`%APPDATA%\vision-studio`
  on Windows, `~/Library/Application Support/vision-studio` on macOS,
  `~/.config/vision-studio` on Linux); see
  [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md#where-the-logs-are)

You will get an acknowledgement within **72 hours** and an assessment with a
fix timeline within **7 days**. We will tell you plainly if we consider a
report out of scope and why. Please give us **90 days** before public
disclosure, or less by agreement if a fix ships sooner.

If you would rather use GitHub, open a
[private security advisory](https://github.com/Git-Rocky-Stack/vision-studio/security/advisories/new)
- it is private to maintainers until published.

## In Scope

- Remote code execution, privilege escalation, or path traversal in the
  Electron main process, the preload IPC bridge, or the Python backend
- A renderer reaching capabilities the preload bridge is not supposed to expose
- Bypassing the **model consent gate** - anything that lets a pickle-format or
  `trust_remote_code` model load without the explicit consent step
- Bypassing **update signature verification**, or getting the updater to
  install an artifact from an unintended origin
- Disclosure of stored secrets: BYOK provider keys, Hugging Face or CivitAI
  tokens, or the local SQLite database
- Backend endpoints reachable from outside `localhost`, or exploitable by a
  web page in the user's browser (DNS rebinding, CSRF against `127.0.0.1:8000`)
- Supply-chain issues in what we actually ship - see
  [`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md)

## Out of Scope

- **Unsigned or newly signed installers.** macOS Gatekeeper warnings (builds
  are not yet notarized), warnings on Windows releases before 3.5.0 (unsigned),
  and a SmartScreen prompt that names the publisher `Sharif Elsalaymeh` while the
  new signing identity builds reputation are expected and documented in the
  [README](README.md). A Windows 3.5.0+ installer that shows **Unknown
  publisher** is in scope: report it.
- **Model weights themselves.** Vision Studio does not redistribute weights.
  What a third-party checkpoint generates, and any licence attached to it, is
  between you and its publisher. Malicious weights loaded *after* you granted
  consent at the security gate are working as designed - a bypass of that gate
  is not.
- Vulnerabilities that require an attacker who already has code execution as
  your user account. A local process that can run arbitrary code can already
  read the same files Vision Studio can.
- Missing hardening headers on `127.0.0.1` endpoints with no demonstrated
  impact, or scanner output submitted without a working proof of concept.
- Denial of service by exhausting your own GPU or disk.

## What We Ship, and How It Is Checked

- **Dependencies.** `npm audit --omit=dev --audit-level=high` gates every pull
  request; the shipped tree is kept at zero known high or critical advisories.
  The backend installs only from hash-locked requirements
  (`pip install --require-hashes`), and `pip-audit` checks the locked runtime
  in the same gate. Every GitHub Action is pinned to a commit SHA.
  Development-only advisories are tracked and cleared separately - they never
  reach your machine, but they build what does.
- **Signature verification.** Windows releases publish through a generic
  update feed with `verifyUpdateCodeSignature` enabled, so the updater refuses
  an artifact whose signature does not resolve to the expected publisher.
  Updates download only when you choose **Download update** in
  **Settings > About**; nothing is downloaded automatically.
- **No telemetry.** Vision Studio has no analytics, telemetry or crash
  reporting. Its network traffic is limited to model searches and downloads you
  initiate, the automatic update check on Windows and Linux (set
  `VISION_STUDIO_DISABLE_UPDATES=1` to turn it off), and any hosted provider you
  configure with your own key.

## Safe Harbour

We will not pursue or support legal action against research conducted in good
faith under this policy: testing against your own installation, no access to or
destruction of other people's data, no degradation of our services, and no
public disclosure before the window above. If you are unsure whether something
is in bounds, ask first at the address above.

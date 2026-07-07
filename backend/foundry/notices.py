"""#34 installer: generate THIRD-PARTY-LICENSES.md from the provision manifest.

Deterministic (no timestamps) so the committed file can be drift-guarded: a
test re-renders and asserts equality. Regenerate after changing the manifest,
license-texts.json, or runtime-licenses.json:

    backend/venv/Scripts/python.exe -m foundry.notices   # run from backend/
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from foundry.provisioning import load_provision_manifest

_HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(_HERE, os.pardir, os.pardir))
LICENSE_TEXTS_PATH = os.path.join(_HERE, "license-texts.json")
RUNTIME_LICENSES_PATH = os.path.join(_HERE, "runtime-licenses.json")
NOTICES_PATH = os.path.join(REPO_ROOT, "THIRD-PARTY-LICENSES.md")

_PREAMBLE = (
    "Vision Studio's own source code is released under the MIT License (see "
    "`LICENSE.txt`). The application additionally bundles the runtime "
    "dependencies and provisions the AI models listed below; each retains its "
    "own license, linked here in accordance with its terms.\n\n"
    "Models under the FLUX.1 [dev] non-commercial license, and other "
    "redistribution-restricted weights (e.g. OpenPose, LTX-Video), are NOT "
    "bundled - they remain optional, user-initiated installs through the "
    "in-app Foundry."
)


def render_notices(
    manifest: Dict[str, Any],
    license_texts: Dict[str, Any],
    runtime: Dict[str, Any],
) -> str:
    """Deterministic THIRD-PARTY-LICENSES.md body from the provision manifest."""
    lines: List[str] = ["# Third-Party Licenses", "", _PREAMBLE, ""]

    lines.append("## Bundled AI Models")
    lines.append("")
    for entry in manifest["auto_set"]:
        lic = license_texts.get(entry.get("license") or "", {})
        name = lic.get("name", entry.get("license") or "unspecified")
        url = lic.get("url")
        label = f"[{name}]({url})" if url else name
        attribution = f" - {entry['attribution']}" if entry.get("attribution") else ""
        lines.append(
            f"- **{entry['name']}** (`{entry['id']}`) - {label}{attribution}")
    lines.append("")

    attributions = sorted({
        e["attribution"] for e in manifest["auto_set"] if e.get("attribution")
    })
    if attributions:
        lines.append("## Required Attributions")
        lines.append("")
        for attribution in attributions:
            lines.append(f"- {attribution}")
        lines.append("")

    lines.append("## Bundled Runtime Dependencies")
    lines.append("")
    for heading, key in (("Python", "python"), ("JavaScript", "javascript")):
        lines.append(f"### {heading}")
        lines.append("")
        for dep in runtime.get(key, []):
            lines.append(f"- **{dep['name']}** - [{dep['license']}]({dep['url']})")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _load(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def build_notices() -> str:
    """Render the notices from the on-disk manifest + license data files."""
    manifest = load_provision_manifest()
    license_texts = _load(LICENSE_TEXTS_PATH)["licenses"]
    runtime = _load(RUNTIME_LICENSES_PATH)
    return render_notices(manifest, license_texts, runtime)


def write_notices() -> str:
    """(Re)write the committed THIRD-PARTY-LICENSES.md; returns its path."""
    content = build_notices()
    with open(NOTICES_PATH, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    return NOTICES_PATH


if __name__ == "__main__":
    print(f"wrote {write_notices()}")

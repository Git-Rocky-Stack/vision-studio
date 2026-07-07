"""#34 installer: license classification for bundle / mirror redistribution.

Bundling model weights into the installer - or hosting them on the Vision
Studio mirror - is *redistribution*, and every model keeps its own license.
This module maps each license id used in ``verified-catalog.json`` to a
redistribution posture.

Fail-closed: an unknown or absent license is treated as NOT redistributable,
so a model can never silently enter the auto-provision set without a vetted,
explicitly-listed license. Uncertain licenses (e.g. custom model licenses we
have not yet reviewed) also fall through to ``unknown`` on purpose.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

# Attribution the Stability AI Community License requires downstream.
STABILITY_ATTRIBUTION = "Powered by Stability AI"

# Categories, most-open to closed.
PERMISSIVE = "permissive"
OPENRAIL = "openrail"
STABILITY_COMMUNITY = "stability-community"
NON_COMMERCIAL = "non-commercial"
UNKNOWN = "unknown"


@dataclass(frozen=True)
class LicenseInfo:
    """Redistribution posture for one license id."""

    license_id: str
    category: str
    redistributable: bool
    requires_attribution: bool
    attribution: Optional[str]
    url: Optional[str]


# (category, redistributable, requires_attribution, attribution, url) keyed by
# the exact license id string used in the catalog. Anything not present here is
# classified UNKNOWN and treated as non-redistributable.
_TABLE: Dict[str, Tuple[str, bool, bool, Optional[str], Optional[str]]] = {
    # Permissive - bundle freely with attribution in THIRD-PARTY-LICENSES.
    "mit": (PERMISSIVE, True, False, None, "https://opensource.org/license/mit"),
    "apache-2.0": (
        PERMISSIVE, True, False, None,
        "https://www.apache.org/licenses/LICENSE-2.0"),
    "bsd-3-clause": (
        PERMISSIVE, True, False, None,
        "https://opensource.org/license/bsd-3-clause"),
    # OpenRAIL family - redistribution permitted; the license + its use-based
    # restrictions must pass through to the end user.
    "creativeml-openrail-m": (
        OPENRAIL, True, False, None,
        "https://huggingface.co/spaces/CompVis/stable-diffusion-license"),
    "openrail": (OPENRAIL, True, False, None, "https://www.licenses.ai/"),
    "openrail++": (
        OPENRAIL, True, False, None,
        "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md"),
    # Stability AI Community License - redistribution permitted with mandatory
    # "Powered by Stability AI" attribution; free below the revenue threshold.
    "stabilityai-community": (
        STABILITY_COMMUNITY, True, True, STABILITY_ATTRIBUTION,
        "https://stability.ai/community-license-agreement"),
    # FLUX.1 [dev] Non-Commercial - redistribution of weights/derivatives is
    # restricted and commercial use prohibited. Never in the auto-set.
    "flux-1-dev-non-commercial": (
        NON_COMMERCIAL, False, False, None,
        "https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-dev"),
}


def classify_license(license_id: Optional[str]) -> LicenseInfo:
    """Redistribution posture for a catalog license id (fail-closed)."""
    key = (license_id or "").strip().lower()
    entry = _TABLE.get(key)
    if entry is None:
        return LicenseInfo(
            license_id=key or "",
            category=UNKNOWN,
            redistributable=False,
            requires_attribution=False,
            attribution=None,
            url=None,
        )
    category, redistributable, requires_attribution, attribution, url = entry
    return LicenseInfo(
        license_id=key,
        category=category,
        redistributable=redistributable,
        requires_attribution=requires_attribution,
        attribution=attribution,
        url=url,
    )
